<!--
Copyright 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

# Update GitHub Workflow Dependency SHAs

Because git tags can be moved or deleted, it's best practice to use SHA
references for `uses` fields in GitHub workflows. This script will update all
workflow files in the `.github/workflows` directory to use the latest SHA for a
given repository and tag.

The script will update all workflow files in `.github/workflows/` from the
current working directory.

```sh
$ npm i -g
$ update-workflow-dependencies
```

## License

[BSD-3-Clause](LICENSE) Copyright 2026 Digital Bazaar, Inc.

Commercial support is available by contacting
[Digital Bazaar](https://digitalbazaar.com/) <support@digitalbazaar.com>.
