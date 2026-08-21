# Bid Studio

Bid Studio turns tender source material and reusable enterprise evidence into an approved, traceable bid artifact.

## Language

**Bid project**: The aggregate root for one submission, including its deadline, owner, stage, process runs, and outputs. _Avoid_: Bid document, workspace

**Tender document**: The buyer-issued source material whose exact text and source locations ground extracted requirements. _Avoid_: Bid, artifact

**Requirement**: One traceable qualification, commercial, technical, or delivery constraint extracted from a tender document. _Avoid_: Paragraph, checklist item

**Score criterion**: A quantified evaluation rule attached to one requirement. _Avoid_: Requirement, score

**Enterprise evidence**: A reusable qualification, case, team, solution, or service record that can support requirements across projects. _Avoid_: Attachment, response

**Evidence match**: A reviewable claim that one enterprise evidence record supports one requirement, including confidence and rationale. _Avoid_: Link, citation

**Risk**: An identified compliance or evidence gap that can prevent a reliable response. _Avoid_: Warning, issue

**Response section**: The drafted answer to one requirement, including its evidence references and approval state. _Avoid_: Artifact, template

**Review**: The human decision that accepts or rejects a set of response sections and their evidence and risk disclosures. _Avoid_: Validation, generation

**Bid artifact**: An exported delivery assembled from approved response sections. _Avoid_: Bid project, response section

**Standard response process**: The versioned coordination definition that orders bid Actions, invokes read-only Functions, and pauses at human review. It is not an ontology primitive. _Avoid_: Action, Function

**Process run**: A durable execution of the standard response process for one bid project. _Avoid_: Session, task

**Process step**: The durable state of one Action invocation within a process run. _Avoid_: Action definition, task
