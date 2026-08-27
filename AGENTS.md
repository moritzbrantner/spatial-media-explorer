# AGENTS.md

This is a product consumer, not a shared spatial-contract owner.

- Follow `moritzbrantner/coding-agent-conventions` for Rust, TypeScript, and React work.
- Keep media selectors owned by the media contract and spatial math/bindings owned by the 3D spatial contract.
- Do not introduce duplicate pose, point, camera, or annotation types when the source crates already own the semantics.
- Product-only DTOs are allowed at the HTTP/UI boundary when they are projections for rendering rather than competing domain models.
- Keep source-mode development independent from package publication.
- Prefer one narrow end-to-end product slice over speculative shared abstractions.
