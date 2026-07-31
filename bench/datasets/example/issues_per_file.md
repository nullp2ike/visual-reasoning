# Expected issues per image

Each `##` heading is a filename in this directory; each `-` bullet below it is
one defect a model is expected to report for that image. A heading with a single
empty bullet is a negative control: the image is clean, so anything a model
reports there counts as a false positive.

## balance_negative.png

- The balance in the header shows a negative value (-1,240), which should never happen.

## clean.png

-

## cta_label_missing.png

- The main call-to-action button is empty: the button is rendered but has no label text.

## cta_text_unreadable.png

- The call-to-action button label is the same color as the button itself, so the text is invisible.

## nav_icon_misaligned.png

- The third item in the bottom navigation bar ("Alerts") sits lower than the other items instead of aligning with them.
