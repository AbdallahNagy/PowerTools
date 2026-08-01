# PowerTools Website Content Design

## Goal

Create the first version of the PowerTools website using Astro. The site should introduce PowerTools as a modern open-source desktop toolkit for Dataverse developers and provide clear paths to download the app, view the source code, and contact the author.

## Audience

The primary audience is Dataverse and Power Platform developers. The content should speak to people who already understand the pain of daily Dataverse work and want tooling that feels modern, clear, and efficient.

## Positioning

PowerTools is a modern open-source desktop toolkit for everyday Dataverse developer workflows. The product should be presented as a growing toolkit, with the first available tools being Data Migration and FetchXML Builder.

The website should avoid positioning PowerTools as only a metadata explorer or only a FetchXML tool. It should also avoid naming future tools that are not implemented yet.

## Tone

The voice should be developer-friendly, practical, and confident. It should feel like an open-source developer tool made by someone who understands the workflow, not like an enterprise sales site.

Use plain, direct language. Avoid inflated claims and heavy marketing language.

## Core Messages

- PowerTools is built for Dataverse developers.
- It is a desktop toolkit, not a single-purpose utility.
- It starts with Data Migration and FetchXML Builder.
- The UI is modern and the UX is friendly.
- Tools should be easy to discover, understand, and use.
- It is open source.
- It is secure by design: user data never leaves the machine.

## Site Structure

The first version should include three pages:

- Landing page: introduce PowerTools and its value.
- Download page: provide the Windows download path and supporting install information.
- Contact author page: provide direct ways to contact the author or contribute feedback.

## Landing Page Content

### Hero

Headline:

PowerTools for Dataverse Developers

Subheadline:

A modern open-source desktop toolkit for everyday Dataverse work.

Supporting copy:

Start with smoother data migration and faster FetchXML workflows, all in a friendly local desktop app.

Primary action:

Download for Windows

Secondary action:

View on GitHub

GitHub URL:

https://github.com/AbdallahNagy/PowerTools

### Why PowerTools

This section should explain the product's differentiators:

- Modern UI: a cleaner interface than older Dataverse tooling.
- Friendly UX: workflows are easier to figure out and use.
- Local and secure: PowerTools runs on the user's machine.
- Open source: developers can inspect the code and contribute.

### Current Tools

List current tools in this order:

1. Data Migration
   Move data between Dataverse environments with a clearer, developer-friendly workflow.

2. FetchXML Builder
   Build, test, and refine FetchXML queries in a cleaner workspace.

Do not list planned future tools by name in the first version.

### Secure By Design

Key statement:

Your data never leaves your machine.

Supporting copy:

PowerTools runs locally and connects directly from the desktop app to your Dataverse environments. It should be clear that the website is marketing the app, not hosting or processing user Dataverse data.

### Open Source

Explain that PowerTools is open source and invite developers to inspect the code, report issues, suggest improvements, and contribute.

GitHub URL:

https://github.com/AbdallahNagy/PowerTools

### Final Call To Action

Offer clear next actions:

- Download for Windows.
- View on GitHub.
- Contact the author.

## Download Page Content

Headline:

Download PowerTools

Purpose:

Give visitors a clear path to get the latest Windows build.

Content:

- Primary Windows download action.
- GitHub Releases link.
- Current version placeholder if release automation is not wired yet.
- Basic Windows requirements.
- Install and update notes.
- Security reminder that PowerTools runs locally and user data stays on the machine.
- Source code link.

## Contact Author Page Content

Headline:

Contact the Author

Purpose:

Let developers send feedback, report bugs, suggest improvements, and discuss contribution ideas.

Contact email:

abdallahnagy773@gmail.com

GitHub URL:

https://github.com/AbdallahNagy/PowerTools

Suggested contact reasons:

- Report a bug.
- Suggest an improvement.
- Share feedback from real Dataverse work.
- Discuss contribution ideas.

## Content Constraints

- Do not claim unimplemented tools are available.
- Do not name future tools in the first version.
- Do not position the product as metadata-explorer-first.
- Mention Data Migration before FetchXML Builder wherever current tools are listed.
- Keep security language clear: user data never leaves the machine.
- Keep the site developer-friendly rather than corporate or sales-heavy.

## Implementation Notes

The implementation should create an Astro website in a top-level `website/` folder inside the existing repository. The first version can use static content and placeholder download metadata until release download automation is defined.
