import {
  appendRegistrationNode,
  goBackRegistrationPath,
} from "@proxus/frontend-core/registration"
import { StudyCatalogUnavailable } from "@proxus/frontend-core/study-catalog"
import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { catalogFor } from "@proxus/product-messages"
import { DateTime } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { useState } from "react"
import {
  RegistrationWizardView,
  type RegistrationOptionsState,
} from "./registration-wizard-view.js"
import type { RegistrationPath } from "./model.js"

const now = DateTime.makeUnsafe(0)
const common = {
  imageAssetId: null,
  status: "published" as const,
  createdAt: now,
  updatedAt: now,
}

const spain = new CountryNode({
  ...common,
  id: makeCountryNodeId("30000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
})
const france = new CountryNode({
  ...common,
  id: makeCountryNodeId("30000000-0000-4000-8000-000000000002"),
  kind: "country",
  name: "Francia",
})
const universityStudies = new StudyTypeNode({
  ...common,
  id: makeStudyTypeNodeId("30000000-0000-4000-8000-000000000003"),
  kind: "type",
  name: "Estudios universitarios",
})
const university = new UniversityNode({
  ...common,
  id: makeUniversityNodeId("30000000-0000-4000-8000-000000000004"),
  kind: "university",
  name: "Universidad Complutense de Madrid",
})
const degree = new DegreeNode({
  ...common,
  id: makeDegreeNodeId("30000000-0000-4000-8000-000000000005"),
  kind: "degree",
  name: "Ingeniería Informática",
})
const subject = new SubjectNode({
  ...common,
  id: makeSubjectNodeId("30000000-0000-4000-8000-000000000006"),
  kind: "subject",
  name: "Estructuras de Datos y Algoritmos",
})

const noop = () => undefined
const registrationPath = (nodes: ReadonlyArray<StudyNode>): RegistrationPath => {
  let path: RegistrationPath = []
  for (const node of nodes) path = appendRegistrationNode(path, node)
  return path
}

const meta = {
  title: "Web/Registration/RegistrationWizard",
  component: RegistrationWizardView,
  parameters: { layout: "fullscreen" },
  args: {
    path: [],
    options: { _tag: "Success", value: [spain, france] },
    landingAssignment: { _tag: "Success", value: { variant: "short" } },
    navigationFailed: false,
    messages: catalogFor("es"),
    languageSelector: <span>Español</span>,
    onSelect: noop,
    onBack: noop,
    onReset: noop,
    onRetryNavigation: noop,
  },
} satisfies Meta<typeof RegistrationWizardView>

export default meta
type Story = StoryObj<typeof meta>

export const Countries: Story = {}

export const Loading: Story = {
  args: { options: { _tag: "Initial" } },
}

export const Empty: Story = {
  args: {
    path: registrationPath([spain]),
    options: { _tag: "Success", value: [] },
  },
}

export const Failure: Story = {
  args: {
    options: {
      _tag: "Failure",
      error: new StudyCatalogUnavailable({ error: new HttpApiError.InternalServerError({}) }),
    },
  },
}

export const UniversityStep: Story = {
  args: {
    path: registrationPath([spain, universityStudies]),
    options: { _tag: "Success", value: [university] },
  },
}

export const Complete: Story = {
  args: {
    path: registrationPath([spain, universityStudies, university, degree, subject]),
    options: { _tag: "Success", value: [] },
  },
}

function InteractiveWizard() {
  const levels: ReadonlyArray<ReadonlyArray<StudyNode>> = [
    [spain, france],
    [universityStudies],
    [university],
    [degree],
    [subject],
  ]
  const [path, setPath] = useState<RegistrationPath>([])
  const options: RegistrationOptionsState = {
    _tag: "Success",
    value: levels[path.length] ?? [],
  }

  return (
    <RegistrationWizardView
      path={path}
      options={options}
      landingAssignment={{ _tag: "Success", value: { variant: "short" } }}
      messages={catalogFor("es")}
      languageSelector={<span>Español</span>}
      navigationFailed={false}
      onSelect={(node) => setPath((current) => appendRegistrationNode(current, node))}
      onBack={() => setPath((current) => goBackRegistrationPath(current))}
      onReset={() => setPath([])}
      onRetryNavigation={noop}
    />
  )
}

export const Interactive: Story = {
  render: () => <InteractiveWizard />,
}
