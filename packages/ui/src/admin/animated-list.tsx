import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion"
import { Children, type ReactNode } from "react"
import { Stack } from "../components/layout.js"

export function AnimatedList({ children }: { readonly children: ReactNode }) {
  const reduceMotion = useReducedMotion() === true
  const motionProps = reduceMotion
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, scale: 0.98 },
        exit: { opacity: 0, scale: 0.98 },
        transition: {
          layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
          opacity: { duration: 0.15 },
          scale: { duration: 0.15 },
        },
      }

  return (
    <LazyMotion features={domAnimation}>
      <Stack gap="sm">
        <AnimatePresence initial={false}>
          {Children.map(children, (child) => (
            <m.div
              layout="position"
              {...motionProps}
              animate={{ opacity: 1, scale: 1 }}
            >
              {child}
            </m.div>
          ))}
        </AnimatePresence>
      </Stack>
    </LazyMotion>
  )
}
