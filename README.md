<!--
Copyright 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

# Update GitHub Workflow Dependency SHAs

Because git tags can be moved or deleted, it's best practice to use SHA
references for `uses` fields in GitHub workflows. This script will update all
workflow files in the `.github/workflows` directory to use the latest SHA for a
given repository and tag.

With no arguments, the script will update all workflow files in
`.github/workflows/` from the current working directory.

```sh
$ npm i -g
$ update-workflow-dependencies
```

Workflow files and directories of workflow files can also be passed as
arguments. Directories are scanned for `.yaml` and `.yml` files, while files
are always processed.

```sh
$ update-workflow-dependencies path/to/.github/workflows
$ update-workflow-dependencies .github/workflows/main.yml
$ update-workflow-dependencies ../other-project/.github/workflows main.yml
```

## License

[BSD-3-Clause](LICENSE) Copyright 2026 Digital Bazaar, Inc.

Commercial support is available by contacting
[Digital Bazaar](https://digitalbazaar.com/) <support@digitalbazaar.com>.
