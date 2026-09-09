/** Durable Bid Studio workbench for the complete standard response route. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  OntologyActionId,
  OntologyDefinition,
  OntologyObject,
  OntologyObjectTypeId,
  OntologyPropertyValue,
} from '@deepseek-ai/dsh-ontology'
import {
  APPROVE_BID_REVIEW,
  BID_OBJECT_TYPES,
  BID_WORKFLOW,
  CREATE_BID_PROJECT,
  EXPORT_BID_DOCUMENT,
  RUN_BID_TO_REVIEW,
} from '../definition.ts'
import css from './BidStudio.module.css'
import { OntologyInspector } from './OntologyInspector.tsx'
import { driverLabel } from './locales.ts'

interface BidStudioRemote {
  listObjects(type?: OntologyObjectTypeId): Promise<readonly OntologyObject[]>
  execute(action: OntologyActionId, input: Readonly<Record<string, OntologyPropertyValue>>): Promise<unknown>
}

type Props = PropsRuntime<'main'> & PropsLocale<'bidStudio'> & {
  definition: OntologyDefinition
  remote: BidStudioRemote
  close: () => void
}

const DEFAULT_TENDER = [
  '1. 投标人必须具备有效的 ISO 9001 质量管理体系认证，5分。',
  '2. 提供城市数据平台或数据治理同类项目案例，10分。',
  '3. 技术方案应覆盖数据采集、治理、共享交换和安全体系，20分。',
  '4. 项目必须在合同签订后 90 日内完成实施交付和验收，10分。',
  '5. 项目团队须包含项目经理、数据架构师和安全工程师，10分。',
  '6. 投标报价不得超过采购预算，商务报价得分15分。',
].join('\n')

/** Render the operational workbench and its secondary ontology inspector. */
export function BidStudio({ definition, remote, close, t }: Props) {
  const [records, setRecords] = useState<Readonly<Record<string, readonly OntologyObject[]>>>({})
  const [projectId, setProjectId] = useState<string>()
  const [artifactId, setArtifactId] = useState<string>()
  const [projectName, setProjectName] = useState(() => t('projects.defaultName'))
  const [tenderText, setTenderText] = useState(DEFAULT_TENDER)
  const [reviewer, setReviewer] = useState(() => t('execution.defaultReviewer'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      Object.values(BID_OBJECT_TYPES).map(async type => [type, await remote.listObjects(type)] as const),
    )
    const next = Object.fromEntries(entries)
    setRecords(next)
    const projects = next[BID_OBJECT_TYPES.project] ?? []
    setProjectId(current => current ?? projects[0]?.id)
  }, [remote])

  useEffect(() => {
    let active = true
    void refresh().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [refresh])

  const projects = ofType(records, BID_OBJECT_TYPES.project)
  const selectedProject = projects.find(project => project.id === projectId)
  const requirements = forProject(records, BID_OBJECT_TYPES.requirement, projectId)
  const matches = forProject(records, BID_OBJECT_TYPES.evidenceMatch, projectId)
  const risks = forProject(records, BID_OBJECT_TYPES.risk, projectId)
  const responses = forProject(records, BID_OBJECT_TYPES.response, projectId)
  const reviews = forProject(records, BID_OBJECT_TYPES.review, projectId)
  const artifacts = forProject(records, BID_OBJECT_TYPES.artifact, projectId)
  const runs = forProject(records, BID_OBJECT_TYPES.workflowRun, projectId)
  const currentRun = runs[0]
  const steps = useMemo(() => ofType(records, BID_OBJECT_TYPES.workflowStep)
    .filter(step => step.properties.runId === currentRun?.id)
    .toSorted((left, right) => numberProperty(left, 'sequence') - numberProperty(right, 'sequence')), [currentRun?.id, records])
  const selectedReview = reviews[0]
  const selectedArtifact = artifacts.find(artifact => artifact.id === artifactId)
    ?? artifacts.find(artifact => stringProperty(artifact, 'status') === '正式版')
    ?? artifacts[artifacts.length - 1]

  async function runAction(action: OntologyActionId, input: Readonly<Record<string, OntologyPropertyValue>>): Promise<unknown> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await remote.execute(action, input)
      await refresh()
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function createProject(): Promise<void> {
    const created = await runAction(CREATE_BID_PROJECT, { name: projectName })
    if (isOntologyObject(created)) setProjectId(created.id)
  }

  async function runWorkflow(): Promise<void> {
    if (selectedProject === undefined) return
    await runAction(RUN_BID_TO_REVIEW, { projectId: selectedProject.id, tenderText })
  }

  async function approveReview(): Promise<void> {
    if (selectedProject === undefined) return
    await runAction(APPROVE_BID_REVIEW, { projectId: selectedProject.id, reviewer, comment: t('execution.approvalComment') })
  }

  async function exportDocument(): Promise<void> {
    if (selectedProject === undefined) return
    const artifact = await runAction(EXPORT_BID_DOCUMENT, { projectId: selectedProject.id })
    if (isOntologyObject(artifact)) setArtifactId(artifact.id)
  }

  function downloadArtifact(): void {
    if (selectedArtifact === undefined) return
    const url = URL.createObjectURL(new Blob(
      [stringProperty(selectedArtifact, 'content')],
      { type: 'text/markdown;charset=utf-8' },
    ))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = stringProperty(selectedArtifact, 'name') || 'bid.md'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const reviewApproved = selectedReview !== undefined && stringProperty(selectedReview, 'status') === '已批准'

  return (
    <main className={css.page}>
      <header className={css.header}>
        <div>
          <div className={css.eyebrow}>{t('page.eyebrow')}</div>
          <h1>{t('page.title')}</h1>
          <p>{t('page.description')}</p>
        </div>
        <button type="button" className={css.secondary} onClick={close}>{t('page.close')}</button>
      </header>

      {error !== undefined && <div className={css.error} role="alert">{error}</div>}

      <section className={css.metrics} aria-label={t('metrics.label')}>
        <article><strong>{requirements.length}</strong><span>{t('metrics.requirements')}</span></article>
        <article><strong>{matches.length}</strong><span>{t('metrics.matches')}</span></article>
        <article><strong>{risks.filter(risk => risk.properties.resolved !== true).length}</strong><span>{t('metrics.risks')}</span></article>
        <article>
          <strong>{responses.filter(response => response.properties.approved === true).length}/{responses.length}</strong>
          <span>{t('metrics.approved')}</span>
        </article>
      </section>

      <section className={css.workspace}>
        <aside className={css.projectPanel}>
          <div className={css.panelTitle}><div><h2>{t('projects.title')}</h2><p>{t('projects.description')}</p></div></div>
          <div className={css.createRow}>
            <input aria-label={t('projects.name')} value={projectName} onChange={(event) => { setProjectName(event.target.value) }} />
            <button
              type="button"
              className={css.primary}
              disabled={busy || projectName.trim().length === 0}
              onClick={() => { void createProject() }}
            >{t('projects.create')}</button>
          </div>
          <div className={css.projectList}>
            {projects.length === 0 && <p className={css.empty}>{t('projects.empty')}</p>}
            {projects.map(project => (
              <button
                type="button"
                key={project.id}
                data-active={project.id === projectId || undefined}
                onClick={() => { setProjectId(project.id); setArtifactId(undefined) }}
              >
                <span>{stringProperty(project, 'name')}</span>
                <small>{stringProperty(project, 'stage')}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className={css.executionPanel}>
          <div className={css.panelTitle}>
            <div><h2>{t('execution.title')}</h2><p>{t('execution.description')}</p></div>
            <span className={css.badge}>{currentRun === undefined ? t('execution.idle') : stringProperty(currentRun, 'status')}</span>
          </div>
          <textarea
            aria-label={t('execution.tender')}
            value={tenderText}
            onChange={(event) => { setTenderText(event.target.value) }}
            disabled={currentRun !== undefined}
          />
          <div className={css.actionBar}>
            <button
              type="button"
              className={css.primary}
              disabled={busy || selectedProject === undefined || currentRun !== undefined || tenderText.trim().length < 20}
              onClick={() => { void runWorkflow() }}
            >{t('execution.run')}</button>
            <input aria-label={t('execution.reviewer')} value={reviewer} onChange={(event) => { setReviewer(event.target.value) }} />
            <button
              type="button"
              className={css.secondary}
              disabled={busy || selectedReview === undefined || reviewApproved || reviewer.trim().length === 0}
              onClick={() => { void approveReview() }}
            >{t('execution.approve')}</button>
            <button
              type="button"
              className={css.primary}
              disabled={busy || !reviewApproved}
              onClick={() => { void exportDocument() }}
            >{t('execution.export')}</button>
          </div>
        </section>
      </section>

      <section className={css.panel}>
        <div className={css.panelTitle}>
          <div><h2>{BID_WORKFLOW.label}</h2><p>{t('workflow.description')}</p></div>
          <span className={css.badge}>{t('workflow.version', { version: BID_WORKFLOW.version })}</span>
        </div>
        <ol className={css.pipeline}>
          {BID_WORKFLOW.steps.map((definitionStep, index) => {
            const step = steps.find(candidate => candidate.properties.stepId === definitionStep.id)
            const status = step === undefined ? '待执行' : stringProperty(step, 'status')
            return (
              <li key={definitionStep.id} data-status={status}>
                <b>{index + 1}</b>
                <span><strong>{definitionStep.label}</strong><small>{driverLabel(definitionStep.driver, t)} · {step === undefined ? t('workflow.pending') : status}</small></span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className={css.traceGrid}>
        <article className={css.panel}>
          <div className={css.panelTitle}><div><h2>{t('trace.title')}</h2><p>{t('trace.description')}</p></div></div>
          <div className={css.traceList}>{requirements.length === 0
            ? <p className={css.empty}>{t('trace.empty')}</p>
            : requirements.map((requirement) => {
              const matchCount = matches.filter(match => match.properties.requirementId === requirement.id).length
              const risk = risks.find(candidate => candidate.properties.requirementId === requirement.id)
              const response = responses.find(candidate => candidate.properties.requirementId === requirement.id)
              return (
                <div key={requirement.id}>
                  <span className={css.category}>{stringProperty(requirement, 'category')}</span>
                  <div>
                    <strong>{stringProperty(requirement, 'title')}</strong>
                    <small>
                      {stringProperty(requirement, 'source')} ·
                      {typeof requirement.properties.score === 'number' ? t('trace.score', { score: requirement.properties.score }) : t('trace.noScore')} ·
                      {t('trace.evidence', { count: matchCount })} · {risk === undefined ? t('trace.noGap') : t('trace.risk', { severity: stringProperty(risk, 'severity') })} ·
                      {response === undefined ? t('trace.pending') : stringProperty(response, 'status')}
                    </small>
                  </div>
                </div>
              )
            })}</div>
        </article>

        <article className={css.panel}>
          <div className={css.panelTitle}>
            <div><h2>{t('artifact.title')}</h2><p>{t('artifact.description')}</p></div>
            <div className={css.headerActions}>
              <button type="button" className={css.secondary} disabled={selectedArtifact === undefined} onClick={downloadArtifact}>{t('artifact.download')}</button>
            </div>
          </div>
          <div className={css.artifactTabs}>{artifacts.map(artifact => (
            <button
              type="button"
              key={artifact.id}
              data-active={artifact.id === selectedArtifact?.id || undefined}
              onClick={() => { setArtifactId(artifact.id) }}
            >{stringProperty(artifact, 'name')}</button>
          ))}</div>
          <pre className={css.preview}>
            {selectedArtifact === undefined
              ? t('artifact.empty')
              : stringProperty(selectedArtifact, 'content')}
          </pre>
        </article>
      </section>

      <OntologyInspector definition={definition} t={t} />
    </main>
  )
}

function ofType(
  records: Readonly<Record<string, readonly OntologyObject[]>>,
  type: OntologyObjectTypeId,
): readonly OntologyObject[] {
  return records[type] ?? []
}

function forProject(
  records: Readonly<Record<string, readonly OntologyObject[]>>,
  type: OntologyObjectTypeId,
  projectId: string | undefined,
): readonly OntologyObject[] {
  return projectId === undefined ? [] : ofType(records, type).filter(record => record.properties.projectId === projectId)
}

function stringProperty(object: OntologyObject, key: string): string {
  const value = object.properties[key]
  return typeof value === 'string' ? value : ''
}

function numberProperty(object: OntologyObject, key: string): number {
  const value = object.properties[key]
  return typeof value === 'number' ? value : 0
}

function isOntologyObject(value: unknown): value is OntologyObject {
  return value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'properties' in value
}
