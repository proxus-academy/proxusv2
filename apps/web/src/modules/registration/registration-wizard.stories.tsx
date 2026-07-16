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
import { DateTime } from "effect"
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

const meta = {
  title: "Web/Registration/RegistrationWizard",
  component: RegistrationWizardView,
  parameters: { layout: "fullscreen" },
  args: {
    locale: "es",
    path: [],
    options: { _tag: "Success", value: [spain, france] },
    onSelect: noop,
    onBack: noop,
    onReset: noop,
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
    path: [spain],
    options: { _tag: "Success", value: [] },
  },
}

export const Failure: Story = {
  args: { options: { _tag: "Failure" } },
}

export const UniversityStep: Story = {
  args: {
    path: [spain, universityStudies],
    options: { _tag: "Success", value: [university] },
  },
}

export const Complete: Story = {
  args: {
    path: [spain, universityStudies, university, degree, subject],
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
      locale="es"
      path={path}
      options={options}
      onSelect={(node) => setPath((current) => [...current, node])}
      onBack={() => setPath((current) => current.slice(0, -1))}
      onReset={() => setPath([])}
    />
  )
}

export const Interactive: Story = {
  render: () => <InteractiveWizard />,
}
