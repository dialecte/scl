---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: SCL Dialecte
  text: IEC 61850, fully typed.
  tagline: Query, mutate, and manage Substation Configuration Language files with a type-safe Document API — 210+ element types, zero guesswork.
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
  - icon: 📄
    title: Document / Query / Transaction
    details: Read with doc.query, write inside doc.transaction(). Changes are staged and committed atomically — no partial writes.
  - icon: 🧩
    title: IEC 61850-6-100 Ready
    details: First-class support for the 6-100 namespace extension. Qualified attributes and extended elements live alongside the base standard.
---
