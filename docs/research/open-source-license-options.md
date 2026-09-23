# Open-source license options for Unshelf

**Decision (2026-09-23):** Start with MIT for simple, permissive reuse. The
comparison below records why the other options were considered.

Researched 2026-09-23. This is a choice among three OSI-approved permissive licenses, not a legal opinion. [OSI license list](https://opensource.org/licenses); [SPDX license list](https://spdx.org/licenses/).

## Repository context

- Unshelf is a deployed web application with a React frontend, Node API, shared package, and repository policy tooling. The root and app `package.json` files currently say `"private": true`; this prevents accidental npm publication but does not grant reuse rights. No root `LICENSE`, `COPYING`, or `NOTICE` file was found in the repository (local inspection, 2026-09-23). GitHub explains that a public repository needs a license to grant permission to use, modify, and distribute its code. [GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository).
- The web app keeps customized shadcn component source in `apps/web/src/components/ui/`, as [ADR-0019](../adr/0019-tailwind-shadcn-visual-architecture.md) records. The upstream shadcn source has its own [MIT copyright and license notice](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md). A new Unshelf license should not replace that upstream notice for substantial copied source; preserve it in a third-party notices file or another distribution-appropriate location after confirming which local files derive from upstream. The package dependencies in `apps/web/package.json` are a separate dependency-license inventory, not automatically relicensed by the root project license.
- No checked-in image, icon, or font asset files with common raster/vector/font extensions were found under `apps/` or `packages/` (local inspection, 2026-09-23). The UI uses the system font stack and imports Lucide icons as a dependency. [UI source](../../apps/web/src/styles/globals.css); [web package](../../apps/web/package.json).

## Comparison

| License | Grant and redistribution conditions | Patent and name treatment | Fit here |
| --- | --- | --- | --- |
| [MIT](https://opensource.org/license/mit) | Broad permission to use, modify, distribute, sublicense, and sell; copies or substantial portions must carry the copyright and permission notice. | Its text has no express patent grant or name/endorsement clause. | Shortest and simplest choice if minimal contributor and downstream paperwork is the main priority. It matches shadcn's license, though shadcn's original notice must still be retained where applicable. |
| [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0.html) | Broad copyright grant. Redistribution requires the license text, notices of changed files, retained applicable source notices, and preservation of an existing `NOTICE` file's attribution notices. A `NOTICE` file is optional when applying the license initially. | Express contributor patent grant, with termination for specified patent litigation; section 6 withholds trademark rights except customary origin descriptions. | Strongest choice if the project expects outside contributors or organizational reuse and wants explicit patent terms. It adds compliance work for people distributing modifications. |
| [BSD-3-Clause](https://opensource.org/license/BSD-3-clause) | Source and binary redistribution are allowed with copyright, conditions, and disclaimer retained in the specified places. | Third clause prohibits use of the copyright holder's or contributors' names to endorse derived products without permission. Its text has no express patent grant. | Suitable if explicit non-endorsement matters more than patent language, but gives this project little practical advantage over the other two. |

All three allow commercial use and proprietary derivatives, subject to their notice terms; none requires derivative source code to be published. This follows from the permissions and conditions in the linked license texts. A permissive software license also does not license the project's name as a trademark or settle the terms of external services such as Clerk. [MIT](https://opensource.org/license/mit); [Apache-2.0 §§2–6](https://www.apache.org/licenses/LICENSE-2.0.html); [BSD-3-Clause](https://opensource.org/license/BSD-3-clause).

## Recommendation and adoption details

Unshelf chose **MIT** to make reuse simple. **Apache-2.0** remains an alternative if explicit patent terms become a priority; its added redistribution obligations would then be part of the decision. BSD-3-Clause is a valid license but has no clear project-specific advantage here. This is a project-fit inference from the terms above, not a claim that one license is universally safer.

The repository now has a root `LICENSE` file, a README pointer, and a separate `THIRD_PARTY_NOTICES.md` for shadcn-derived source. The copyright holder shown in `LICENSE` is Rajat Gedam, consistent with repository authorship; `git shortlog` alone cannot establish ownership of every contribution. The private workspace package metadata remains independent of the repository license.
