# Security

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's **Report a vulnerability** button on the Security tab of this repository, which opens a private advisory. Include steps to reproduce and what an attacker could reach.

## What the design protects

The full model is in the README under "How the vault works". In short:

- **Logins never leave the browser unencrypted.** The server stores AES-GCM ciphertext and keys wrapped to members' RSA-OAEP public keys. A database dump, Worker logs or Cloudflare dashboard access reveals no logins.
- **Server-side checks back up the crypto.** Private logins' ciphertext is only served to their owner, and every mutation requires a signed-in, allowlisted member.
- **Tamper checks.** The browser verifies that the public key the server returns matches the member's private key. It pins the group key's fingerprint and refuses a different key at the same version. Members compare 128-bit key fingerprints over Discord before granting access and before a rotation.
- **Server rules.** Shared logins are only accepted under the current group key. Approvals only go to members who are actually waiting. A rotation either completes fully or not at all. Cross-site POSTs are rejected, and the session cookie is `__Host-`, HttpOnly, Secure and SameSite=Lax.
- **No internals in errors.** Only messages written for users reach the browser. Anything unexpected is logged server-side and replaced with a generic message.

## Known limits

- Whoever can deploy the Worker can ship JavaScript that reads logins as members type them. That's true of every web-based vault. Self-host and review changes before deploying.
- A member who saw a password before being removed still knows it. Rotate the Riot password.
- Someone who can write to the database can still try to plant keys at a new member's first approval or during a rotation. Fingerprint comparison is what catches that.
- Stored logins aren't cryptographically bound to their account, so a database writer could swap two ciphertexts between accounts. They can't read either one.
- The CSP allows inline scripts because TanStack Start hydrates from one. There's no known injection point, and `connect-src 'self'` limits where a script could send data.
