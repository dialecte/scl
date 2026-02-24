---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: SCL Dialecte
  text: IEC 61850, fully typed.
  tagline: Navigate, mutate, and query Substation Configuration Language files with a chainable, type-safe API — 210+ element types, zero guesswork.
  image:
    src: /logo-reversed.svg
    alt: SCL Dialecte
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/introduction/getting-started
    - theme: alt
      text: Why SCL Dialecte?
      link: /guide/introduction/what-is-scl-dialecte

features:
  - icon: ⚡
    title: 210+ Element Types
    details: Every SCL element — from Substation to ConductingEquipment — is fully typed. Attributes, children, and parent relationships are all compiler-checked.
  - icon: 🔗
    title: Chainable API
    details: Navigate to a Bay, add a VoltageLevel, update an IED — all in one fluent chain. Changes are staged and committed atomically.
  - icon: 🧩
    title: IEC 61850-6-100 Ready
    details: First-class support for the 6-100 namespace extension. Qualified attributes and extended elements live alongside the base standard.
---
