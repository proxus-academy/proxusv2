import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { OtpInput } from "./otp-input.js"

const meta = { title: "Components/OtpInput", component: OtpInput } satisfies Meta<typeof OtpInput>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { value: "", onChange: () => undefined },
  render: (args) => {
    const [value, setValue] = useState("")
    return <OtpInput {...args} value={value} onChange={setValue} />
  },
}
