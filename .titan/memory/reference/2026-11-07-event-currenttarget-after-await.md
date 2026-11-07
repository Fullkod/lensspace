# event.currentTarget is null after an await

Date: 2026-11-07

React clears `event.currentTarget` once a handler yields. In an async submit handler,
store the element first (`const formElement = event.currentTarget`) and use it after any
`await` (e.g. `formElement.reset()`).

Evidence: LEN0005. `PrescriptionWorkspace` called `event.currentTarget.reset()` after
saving, so the prescription was stored but the screen crashed (`Cannot read properties of
null (reading 'reset')`), the button stayed in "saving" and users believed it failed.
QA: `.titan/qa/2026-11-07-len0005/`.
