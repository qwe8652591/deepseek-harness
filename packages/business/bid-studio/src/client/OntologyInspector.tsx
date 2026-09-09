/** Interactive view of every object, relationship, Function, Action, and process definition. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { OntologyDefinition, OntologyObjectTypeId, OntologyPropertyValue } from '@deepseek-ai/dsh-ontology'
import { BID_WORKFLOW } from '../definition.ts'
import css from './BidStudio.module.css'
import { driverLabel } from './locales.ts'

type InspectorSection = 'objects' | 'links' | 'functions' | 'actions' | 'workflow'

interface OntologyInspectorProps extends PropsLocale<'bidStudio'> {
  definition: OntologyDefinition
}

/** Render the complete installable definition instead of only its object properties. */
export function OntologyInspector({ definition, t }: OntologyInspectorProps) {
  const [section, setSection] = useState<InspectorSection>('objects')
  const [selectedTypeId, setSelectedTypeId] = useState(definition.objectTypes[0]?.id)
  const [selectedLinkId, setSelectedLinkId] = useState(definition.linkTypes[0]?.id)
  const [selectedFunctionId, setSelectedFunctionId] = useState(definition.functions[0]?.id)
  const [selectedActionId, setSelectedActionId] = useState(definition.actions[0]?.id)
  const [selectedStepId, setSelectedStepId] = useState(BID_WORKFLOW.steps[0]?.id)
  const selectedType = definition.objectTypes.find(type => type.id === selectedTypeId)
  const selectedLink = definition.linkTypes.find(link => link.id === selectedLinkId)
  const selectedFunction = definition.functions.find(functionDefinition => functionDefinition.id === selectedFunctionId)
  const selectedAction = definition.actions.find(action => action.id === selectedActionId)
  const selectedStep = BID_WORKFLOW.steps.find(step => step.id === selectedStepId)

  return (
    <details className={css.inspector} aria-label={t('inspector.label')}>
      <summary>
        {t('inspector.summary', { objects: definition.objectTypes.length, links: definition.linkTypes.length, functions: definition.functions.length, actions: definition.actions.length })}
      </summary>
      <nav className={css.inspectorTabs} aria-label={t('inspector.views')}>
        <InspectorTab active={section === 'objects'} onClick={() => { setSection('objects') }} label={t('inspector.objects')} count={definition.objectTypes.length} />
        <InspectorTab active={section === 'links'} onClick={() => { setSection('links') }} label={t('inspector.links')} count={definition.linkTypes.length} />
        <InspectorTab active={section === 'functions'} onClick={() => { setSection('functions') }} label={t('inspector.functions')} count={definition.functions.length} />
        <InspectorTab active={section === 'actions'} onClick={() => { setSection('actions') }} label={t('inspector.actions')} count={definition.actions.length} />
        <InspectorTab active={section === 'workflow'} onClick={() => { setSection('workflow') }} label={t('inspector.workflow')} count={BID_WORKFLOW.steps.length} />
      </nav>

      {section === 'objects' && <div className={css.ontology}>
        <div className={css.typeList}>{definition.objectTypes.map(type => (
          <button
            type="button"
            key={type.id}
            data-active={selectedTypeId === type.id || undefined}
            onClick={() => { setSelectedTypeId(type.id) }}
          ><span>{type.label}</span><small>{type.id}</small></button>
        ))}</div>
        <div className={css.typeDetail}>{selectedType !== undefined && <>
          <DefinitionHeading title={selectedType.label} description={selectedType.description} id={selectedType.id} />
          <div className={css.propertyGrid}>{selectedType.properties.map(property => (
            <div key={property.key}>
              <code>{property.key}</code><span>{property.label}</span><small>{property.type}{property.required ? t('inspector.required') : ''}{formatValues(property.values)}</small>
            </div>
          ))}</div>
        </>}</div>
      </div>}

      {section === 'functions' && <div className={css.ontology}>
        <div className={css.typeList}>{definition.functions.map(functionDefinition => (
          <button
            type="button"
            key={functionDefinition.id}
            data-active={selectedFunctionId === functionDefinition.id || undefined}
            onClick={() => { setSelectedFunctionId(functionDefinition.id) }}
          ><span>{functionDefinition.label}</span><small>{functionDefinition.id}</small></button>
        ))}</div>
        <div className={css.typeDetail}>{selectedFunction !== undefined && <>
          <DefinitionHeading title={selectedFunction.label} description={selectedFunction.description} id={selectedFunction.id} badge={t('inspector.readOnly')} />
          <div className={css.definitionMeta}>
            <div><small>{t('inspector.resultType')}</small><strong>{functionResultLabel(selectedFunction.result, definition, t)}</strong></div>
          </div>
          <h3 className={css.definitionSubheading}>{t('inspector.inputs')}</h3>
          {selectedFunction.inputs === undefined || selectedFunction.inputs.length === 0
            ? <p className={css.empty}>{t('inspector.noInputs')}</p>
            : <div className={css.propertyGrid}>{selectedFunction.inputs.map(input => (
              <div key={input.key}>
                <code>{input.key}</code><span>{input.label}</span><small>{input.type}{input.required ? t('inspector.required') : ''}{formatValues(input.values)}</small>
              </div>
            ))}</div>}
        </>}</div>
      </div>}

      {section === 'links' && <div className={css.ontology}>
        <div className={css.typeList}>{definition.linkTypes.map(link => (
          <button
            type="button"
            key={link.id}
            data-active={selectedLinkId === link.id || undefined}
            onClick={() => { setSelectedLinkId(link.id) }}
          ><span>{link.label}</span><small>{link.id}</small></button>
        ))}</div>
        <div className={css.typeDetail}>{selectedLink !== undefined && <>
          <DefinitionHeading title={selectedLink.label} description={selectedLink.description ?? t('inspector.linkDescription')} id={selectedLink.id} />
          <div className={css.relationRoute}>
            <ObjectReference label={t('inspector.source')} typeId={selectedLink.from} definition={definition} />
            <span aria-hidden="true">→</span>
            <ObjectReference label={t('inspector.target')} typeId={selectedLink.to} definition={definition} />
          </div>
          <div className={css.definitionMeta}>
            <div><small>{t('inspector.cardinality')}</small><strong>{cardinalityLabel(selectedLink.cardinality, t)}</strong></div>
            <div><small>{t('inspector.direction')}</small><strong>{t('inspector.forward')}</strong></div>
          </div>
        </>}</div>
      </div>}

      {section === 'actions' && <div className={css.ontology}>
        <div className={css.typeList}>{definition.actions.map(action => (
          <button
            type="button"
            key={action.id}
            data-active={selectedActionId === action.id || undefined}
            onClick={() => { setSelectedActionId(action.id) }}
          ><span>{action.label}</span><small>{driverLabel(action.driver, t)} · {action.id}</small></button>
        ))}</div>
        <div className={css.typeDetail}>{selectedAction !== undefined && <>
          <DefinitionHeading title={selectedAction.label} description={selectedAction.description} id={selectedAction.id} badge={t('inspector.drivenBy', { driver: driverLabel(selectedAction.driver, t) })} />
          <div className={css.definitionMeta}>
            <DefinitionReference label={t('inspector.actionTarget')} typeId={selectedAction.target} definition={definition} emptyLabel={t('inspector.none')} />
            <DefinitionReference label={t('inspector.actionResult')} typeId={selectedAction.result} definition={definition} emptyLabel={t('inspector.none')} />
          </div>
          <h3 className={css.definitionSubheading}>{t('inspector.inputs')}</h3>
          {selectedAction.inputs === undefined || selectedAction.inputs.length === 0
            ? <p className={css.empty}>{t('inspector.noInputs')}</p>
            : <div className={css.propertyGrid}>{selectedAction.inputs.map(input => (
              <div key={input.key}>
                <code>{input.key}</code><span>{input.label}</span><small>{input.type}{input.required ? t('inspector.required') : ''}{formatValues(input.values)}</small>
              </div>
            ))}</div>}
        </>}</div>
      </div>}

      {section === 'workflow' && <div className={css.ontology}>
        <div className={css.typeList}>{BID_WORKFLOW.steps.map((step, index) => (
          <button
            type="button"
            key={step.id}
            data-active={selectedStepId === step.id || undefined}
            onClick={() => { setSelectedStepId(step.id) }}
          ><span>{index + 1}. {step.label}</span><small>{driverLabel(step.driver, t)} · {step.action}</small></button>
        ))}</div>
        <div className={css.typeDetail}>{selectedStep !== undefined && <>
          <DefinitionHeading
            title={BID_WORKFLOW.label}
            description={t('inspector.stepDescription', { step: BID_WORKFLOW.steps.findIndex(step => step.id === selectedStep.id) + 1, description: selectedStep.description })}
            id={`${BID_WORKFLOW.id}@${BID_WORKFLOW.version}`}
            badge={driverLabel(selectedStep.driver, t)}
          />
          <div className={css.definitionMeta}>
            <div><small>{t('inspector.step')}</small><strong>{selectedStep.label}</strong><code>{selectedStep.id}</code></div>
            <div>
              <small>{t('inspector.execute')}</small>
              <strong>{definition.actions.find(action => action.id === selectedStep.action)?.label ?? selectedStep.action}</strong>
              <code>{selectedStep.action}</code>
            </div>
          </div>
          <h3 className={css.definitionSubheading}>{t('inspector.outputs')}</h3>
          <div className={css.outputList}>{selectedStep.produces.map(typeId => (
            <ObjectReference key={typeId} label={t('inspector.output')} typeId={typeId} definition={definition} />
          ))}</div>
        </>}</div>
      </div>}
    </details>
  )
}

function InspectorTab(
  { active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number },
) {
  return <button type="button" data-active={active || undefined} onClick={onClick}>{label} <span>{count}</span></button>
}

function DefinitionHeading(
  { title, description, id, badge }: { title: string; description: string; id: string; badge?: string },
) {
  return <div className={css.panelTitle}>
    <div><h2>{title}</h2><p>{description}</p><code className={css.definitionId}>{id}</code></div>
    {badge !== undefined && <span className={css.badge}>{badge}</span>}
  </div>
}

function ObjectReference(
  { label, typeId, definition }: { label: string; typeId: OntologyObjectTypeId; definition: OntologyDefinition },
) {
  const type = definition.objectTypes.find(candidate => candidate.id === typeId)
  return <div><small>{label}</small><strong>{type?.label ?? typeId}</strong><code>{typeId}</code></div>
}

function DefinitionReference(
  { label, typeId, definition, emptyLabel }: {
    label: string
    typeId: OntologyObjectTypeId | undefined
    definition: OntologyDefinition
    emptyLabel: string
  },
) {
  if (typeId === undefined) return <div><small>{label}</small><strong>{emptyLabel}</strong></div>
  return <ObjectReference label={label} typeId={typeId} definition={definition} />
}

function formatValues(values: readonly OntologyPropertyValue[] | undefined): string {
  return values === undefined ? '' : ` · ${values.join(' / ')}`
}

function cardinalityLabel(cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many' | undefined, t: PropsLocale<'bidStudio'>['t']): string {
  return ({ 'one-to-one': t('inspector.oneToOne'), 'one-to-many': t('inspector.oneToMany'), 'many-to-many': t('inspector.manyToMany') })[cardinality ?? 'one-to-many']
}

function functionResultLabel(
  result: OntologyDefinition['functions'][number]['result'],
  definition: OntologyDefinition,
  t: PropsLocale<'bidStudio'>['t'],
): string {
  if (result.kind === 'scalar') return result.type
  const objectType = definition.objectTypes.find(type => type.id === result.objectType)
  const type = objectType?.label ?? result.objectType
  return result.kind === 'object-list' ? t('inspector.objectList', { type }) : type
}
