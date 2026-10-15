---
seoTitle: "Solution Layers Explorer for Dataverse | PowerTools"
seoDescription: "See every solution layer of a Dataverse component, compare any two layers property by property, and remove the unmanaged Active layer when needed."
xrmToolBoxEquivalent: "Solution Layers Explorer"
features:
  - List every layer of a component, from the system layer to the Active layer
  - See what each layer changed, its full properties, and its children
  - Compare any two layers property by property
  - Show only the properties that differ
  - Diff long values side by side, with JSON pretty-printed and web resources decoded
  - Remove the unmanaged Active layer for one component or many
---

## Understand why a component looks the way it does

Every Dataverse component, such as a form, view, column, or web resource, can have several solution layers. Managed solutions stack on top of the system layer, and unmanaged customizations sit on top as the Active layer. Solution Layers Explorer shows that whole stack for a component, with each layer's order, solution, publisher, version, and time.

Select a layer to see what it changed, the component's full state in that layer, and its child components.

## Compare two layers

Pick any two layers of the same component and compare them property by property. Each property that differs is marked, and you can hide the rest. Choose a property to see its two values side by side with the changed lines highlighted. JSON values are pretty-printed first, and web resource content is decoded from base64 before comparing.

## Remove the Active layer

When unmanaged changes are hiding a managed update, remove the Active layer and the component falls back to the layer below it. You can do this for one component or for several at once, always after a confirmation.

## When to use it

- Finding out why a managed solution update did not appear.
- Checking what an unmanaged customization changed on top of a managed form or view.
- Cleaning unmanaged layers out of a production environment.
