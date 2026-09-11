'use client'

// This must stay a Client Component. If it renders on the server, React's Flight
// serializer hands `<NextLink />` to `<DataInteractive>` as an unresolved lazy
// wrapper instead of an element, and Headless UI throws `Passing props on "Fragment"!`
// because it cannot clone its props onto a non-element child.

import * as Headless from '@headlessui/react'
import NextLink, { type LinkProps } from 'next/link'
import React, { forwardRef } from 'react'

export const Link = forwardRef(function Link(
  props: LinkProps & React.ComponentPropsWithoutRef<'a'>,
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  return (
    <Headless.DataInteractive>
      <NextLink {...props} ref={ref} />
    </Headless.DataInteractive>
  )
})
