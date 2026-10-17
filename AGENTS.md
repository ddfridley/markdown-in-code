# Review and regression policy

- Run Node/npm through the repository `.bashrc` and `nvs.sh`.
- Screenshot comparison may generate preliminary images, reports and review pages. It must never modify accepted images or their acceptance manifest.
- Do not run `visual:accept`, edit accepted baselines, or edit `accepted.json` without explicit human approval of the identified run/images. A request to fix rendering, run tests or generate previews is not approval of the resulting screenshots.
- Show the accepted/preliminary/diff review page when visual output changes. Leave screenshot tests failing until those changes receive human review. Do not regenerate expectations merely to make tests pass.
- Preserve behavior assertions and `tests/contracts/` independently of implementation changes. Obtain explicit agreement before changing the behavior they specify; explain changed expectations in the result.
- Preserve user edits to manual fixtures. Do not replace them from visual fixtures.
