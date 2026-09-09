---
description: "Install the Bid Studio business workbench over a Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-bid-studio-bundle

English | [中文](README.zh.md)

## Summary

Profile patch bundle that installs the local ontology Provider, its browser Remote, a host-level worker-thread Workflow Provider, and the Bid Studio dual-face plugin. The Workflow Provider is explicit because the standard Web bundle delegates conversational workflows to session presets while Bid Studio owns a business workflow outside a conversation. Add the bundle after the standard Web bundle:

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

```powershell
pnpm dsh plugin --profile web add @deepseek-ai/dsh-bid-studio-bundle
pnpm dsh --profile web
```

## Model Experience

### Bundle composition

#### What the model sees

The bundle itself adds nothing; the plugins inserted by `cordis.patch.yml` own any model-visible content.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent; the bundle itself contributes no model request content.

## Known Limitations and Deferred Work

- **Web base required** — this patch adds business plugins but does not install the standard Web surface itself.

<a id="dev-note"></a>
### Dev Note

No invariant companion is published: this bundle contributes a static patch list; the installed plugins own runtime checks.
