// Who opened a connection to 127.0.0.1. Tailscale's login header is only believed on a connection opened by
// tailscaled (root) or by this machine's owner: another user on the machine could reach 127.0.0.1 and send the
// header itself. Linux reads the kernel's socket table; macOS asks nettop and ps. Only the exact connection counts (caller
// 127.0.0.1:<port> to the service's 127.0.0.1:<service>, established); none, or more than one owner: not believed.
import { existsSync, readFileSync } from "node:fs";

const ME = process.getuid?.() ?? -1;
const PS = ["/bin/ps", "/usr/bin/ps"].find((p) => existsSync(p)) ?? "ps";
const LOOP4 = "0100007F";                              // 127.0.0.1 as /proc/net/tcp writes it
const LOOP6 = "0000000000000000FFFF00000100007F";      // ::ffff:127.0.0.1 in tcp6
const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

/** The uid owning the caller's side of the connection 127.0.0.1:<port> -> 127.0.0.1:<service>, or null. */
export function peerUid(port: number, service: number): number | null {
  const uids = new Set<number>();
  if (process.platform === "linux") {
    for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
      let text = "";
      try { text = readFileSync(table, "utf8"); } catch { continue; }
      for (const line of text.split("\n").slice(1)) {
        const f = line.trim().split(/\s+/);
        if (f.length < 8 || f[3] !== "01") continue; // ESTABLISHED only
        const ok = (a: string, p: number) => a === `${LOOP4}:${hex(p)}` || a === `${LOOP6}:${hex(p)}`;
        if (ok(f[1], port) && ok(f[2], service)) uids.add(Number(f[7]));
      }
    }
  } else if (process.platform === "darwin") {
    // lsof sees only this user's sockets, and Tailscale's network extension runs as root. netstat and the socket
    // table list no TCP sockets at all to a bun process or its children (seen on macOS 27: the web app refused
    // Tailscale itself); nettop still names every socket's process. It and ps are in /usr/bin and /bin, which
    // launchd's PATH for the service may lack; neither answering: not believed.
    const pids = darwinPids(port, service);
    for (const pid of pids) {
      let out = "";
      try { out = Bun.spawnSync([PS, "-o", "uid=", "-p", String(pid)], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim(); } catch {}
      if (/^\d+$/.test(out)) uids.add(Number(out));
    }
    // the same process still holds it after ps answered (not one gone and its pid given to another)
    if (JSON.stringify(darwinPids(port, service)) !== JSON.stringify(pids)) return null;
  }
  return uids.size === 1 ? [...uids][0] : null;
}

/** macOS: the pids holding the caller's side, 127.0.0.1:<port> -> 127.0.0.1:<service>, established, from nettop's
 *  listing ("<name>.<pid>" rows, each followed by its sockets). A name is its owner's choice and may hold a line break
 *  and a comma to pose as another pid's row: only a pid nettop -p (by the kernel's pid, not the text) lists it under counts. */
export function darwinPids(port: number, service: number, run = nettop): number[] {
  const conn = `tcp4 127.0.0.1:${port}<->127.0.0.1:${service}`;
  const held = (text: string) => {
    const pids: number[] = [];
    let pid: number | null = null;
    for (const line of text.split("\n")) {
      const f = line.split(",");
      if (!f[0].includes("<->")) pid = /\.(\d+)$/.test(f[0]) ? Number(f[0].split(".").pop()) : null;
      else if (f[0] === conn && f[1] === "Established" && pid !== null) pids.push(pid);
    }
    return pids;
  };
  return [...new Set(held(run([])))].filter((pid) => held(run(["-p", String(pid)])).includes(pid));
}

function nettop(more: string[]) {
  try { return Bun.spawnSync(["/usr/bin/nettop", "-m", "tcp", "-L", "1", "-n", "-x", "-J", "state", ...more], { stdout: "pipe", stderr: "ignore" }).stdout.toString(); } catch { return ""; }
}

/** Tailscale (root) or the owner. */
export const trustedPeer = (port: number | undefined, service: number) => {
  if (!port) return false;
  const uid = peerUid(port, service);
  return uid === 0 || (uid !== null && uid === ME);
};
