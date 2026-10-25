# Portfolio mobile layout

## Scope

Extend the existing portfolio with a mobile navigation disclosure and focused
responsive rules. Preserve the approved dark hero, italic name and section labels,
01–05 markers, employment content, portrait, and project screenshot. This is a
local implementation; it does not deploy the redesigned site or CMS.

## Navigation

- At widths up to 800px, show the name and a 44px-minimum Menu button on one row.
- The button exposes an inline navigation region, with About, Work, Experience,
  and the contact action. Expanding the region moves content down instead of
  covering it. Use disclosure semantics, not modal or application-menu roles.
- Keep native anchors and smooth scrolling. Selecting a link closes the region;
  Escape closes it and returns focus to the toggle. Moving focus outside the
  header closes it without pulling focus back.
- Breakpoint changes reset the disclosure. Focus moves out of controls that
  become hidden. Desktop links remain visible without a toggle.
- Continue honoring the existing reduced-motion rule, including the menu icon.

## Public layout

Use 20–24px horizontal padding up to 800px, single-column project and experience
layouts, and fluid headings. The portrait retains its original aspect ratio and
uses the available width. The earlier project's screenshot precedes its text
visually on mobile. Text and links wrap instead of clipping. At 360px and below,
hide only the decorative section rule to give labels more space.

The experience index becomes an ordinary non-sticky list, and detail-page
summaries and actions stack. Public forms use 16px inputs. Primary calls to action
use the available mobile width; footer links retain comfortable touch targets.

## Admin layout

Use a two-column navigation with the new-project action on its own full-width
row. Project rows become cards, editor fields stack, upload controls fit their
containers, and action buttons have separate full-width rows. Keep actions in
document flow so they do not cover fields or the virtual keyboard. Existing save,
publish, confirmation, authentication, and unsaved-change behavior is unchanged.

## Verification boundaries

Automated DOM tests cover disclosure visibility, native link behavior, Escape,
focus leaving the header, breakpoint changes, focus transfer, and listener
cleanup. They do not validate CSS layout, actual animation, or touch behavior.

The browser tool failed to start in this environment. Actual 320px, 390px,
tablet, landscape, keyboard, and device layout checks remain pending. The CSS
contains narrow-width rules, but no claim of pixel-level viewport verification
is made. The developer server remains bound to localhost; no network exposure
was enabled for phone testing.
