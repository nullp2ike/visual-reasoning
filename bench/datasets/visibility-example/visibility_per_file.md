# Element visibility per image

Each `##` heading is a filename in this directory. Under it, `### visible`
lists elements the screen is claimed to have and `### absent` ones it is claimed
to lack. Elements are sorted within each call, so their order says nothing about
the expected answers. Grading is deterministic: an element is correct when the
model's answer matches what the ground truth expects.

The section decides **which prompt asks**: `### visible` elements go through
`elementsVisible()` ("X is fully visible"), `### absent` ones through
`elementsHidden()` ("X is NOT visible").

A bullet may end with `| TRUE` or `| FALSE`, stating whether its section's
claim actually holds, and so deciding the expected answer. The default is TRUE.
`| FALSE` inverts it: "the Orbit chewing gum logo" describes something the
header does not contain, even though an Orbit title does, so under
`### visible` the model should answer that it is not visible. Each section here
carries at least one flagged bullet, so neither call can be passed by answering
the same way throughout. The flag is never sent to a model — only the
description is.

## orbit_home.png

### visible

- The "Orbit" app title in the header
- The "Orbit" chewing gum logo in the header | FALSE
- A search bar with the placeholder text "Search"
- A "Start now" call-to-action button
- A bottom navigation bar with Home, Search, Alerts and Profile tabs
- The balance "1,240" in the top-right of the header

### absent

- A settings gear icon in the header
- A red notification badge with a count on the Alerts tab
- A cookie consent banner at the bottom of the screen
- A back arrow in the top-left corner
- A grid of four content cards labelled "Item 1" to "Item 4" | FALSE
