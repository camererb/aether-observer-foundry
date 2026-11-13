# Security

Aether Observer runs inside your Foundry as a GM-only module. What it does on the network:

- It only talks to the address you paste into **Aether Vision link** (your own maps on aetherobserver.com), and only to read
  your own maps. It sends nothing back: every request is a read (GET), without cookies.
- The key in that link is a password for your story's maps. It is kept on your computer only (a client setting, never sent to
  players) and it only travels over https (plain http is accepted only for a server on your own computer).
- The sample maps need no link and no network: they are inside the module.
- It does not run code from a map file: map files are only data (a picture, walls, doors, lights).

**Reporting a problem:** please don't open a public issue for a security problem. Use this repository's **Security** tab,
**Report a vulnerability** (private), or email the address on <https://aetherobserver.com>. If a link was ever shared by
mistake, replace it: on Aether Observer open the story's Vision tab, Foundry link, **Make a new link** (the old one stops
working at once).
