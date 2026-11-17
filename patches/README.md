# Picomatch ReDoS mitigation

As of 2026-11-17, GHSA-fc5q-39xc-vjpf affects every published picomatch
version and has no patched release:
https://github.com/advisories/GHSA-fc5q-39xc-vjpf

Both apps apply local pnpm patches to 2.3.2 and 4.0.7. The patches extend the
existing repeated-extglob safety guard to single branches containing `*`.
These patterns are treated as literals instead of compiling nested unbounded
quantifiers. This deliberately sacrifices wildcard semantics for these
potentially dangerous repeated patterns; ordinary globs and literal repeated
extglobs continue to work.

The audit exception is limited to this advisory because registry audits cannot
recognize locally patched code. The security gate checks every installed
picomatch copy in both apps in a subprocess with a timeout before auditing.
Missing patches fail the gate. All other advisory checks remain enabled.

The patches are duplicated in `admin/patches` because the admin Docker build
has its own build context. Keep the copies identical. Replace these patches
and remove the audit exception once an upstream fixed release is available.
