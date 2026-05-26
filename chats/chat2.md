# Static HTML Site

_Started 2026-05-25 10:59 UTC_

---

## User

it's all just html? not react?

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: list_files]_

Let me take a look at what's in the project to give you a proper answer.

_[tool: read_file]_

_[tool: read_file]_

It's a mix! The **entry points are plain HTML files** (index.html, the various `.html` pages), but they load **React + Babel JSX components** from the `components/` folder — things like `sidebar.jsx`, `swimlane.jsx`, `timeline.jsx`, etc., which use hooks (`useState`, `useContext`) and React patterns.

So the architecture is:
- **HTML** = shell, styles, layout scaffolding
- **JSX files** = React components loaded via `<script type="text/babel" src="...">` and rendered into the page

Is there something specific you'd like to change or build on top of this? Happy to add new screens, refactor a component, or shift to a different approach entirely.

