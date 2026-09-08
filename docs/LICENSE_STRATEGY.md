# License strategy

ARPA House Search uses Fredy commit `2a815c92e6da9cceb9633fb5b96086897a245c35` as its code baseline because that snapshot was distributed under the MIT License.

On December 11, 2025, the upstream Fredy repository changed its licensing. Later versions include additional restrictions, including a naming/branding condition. ARPA therefore does not use later Fredy source code as an implementation donor by default.

Rules for contributors:

1. Preserve the MIT copyright and permission notice from the baseline.
2. Do not cherry-pick post-baseline Fredy commits into ARPA without checking the applicable license/permission.
3. Architecture and product ideas may be reimplemented independently.
4. Prefer clearly permissive donor projects (for example MIT/Apache-2.0) when implementation reuse is useful.

This document records the project's engineering provenance decision; it is not legal advice.
