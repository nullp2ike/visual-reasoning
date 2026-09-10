# Assertions per image

Ground truth for the **assertion accuracy** benchmark (`pnpm assertion:run`).

Each `##` heading is a filename in this directory. The section a bullet sits
under decides **which prompt asks about it**: `### visible` elements go through
`elementsVisible()` ("X is visible on the page"), `### absent` ones through
`elementsHidden()` ("X is NOT visible on the page"). A rep therefore makes one
call per section, and elements are sorted within each call so their order never
hints at the expected answers.

A bullet may end with `| TRUE` or `| FALSE`, saying whether its section's claim
actually holds for that element. The default is `TRUE`. `| FALSE` inverts it, so
under `### visible` it marks something the screen does not show, and under
`### absent` something it does. The flag never reaches a model, only the
description does, so re-labelling regrades existing runs without re-running them.

Every image here is the same home feed carrying at most one seeded defect, so
the statement bank below is identical in all 18 sections and only the flags
differ. A model cannot tell which file is the seeded one from the wording, which
is what makes this measure defect detection rather than question spotting.

Two bullets in each section are false in every file. They are deliberate: a call
whose answers are all the same can be passed by answering uniformly without
reading the image, and the report warns when that happens.

Adding, rewording or moving a bullet changes
the prompt and marks existing runs stale; flipping a flag does not.

## 00_clean_control.png

### visible

- The delivery address in the header
- The section heading "Popular right now"
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 01_raw_localization_key.png

### visible

- The section heading "Popular right now" | FALSE
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations | FALSE
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 02_invalid_placeholder_data.png

### visible

- Correct delivery fee information | FALSE
- The delivery address in the header
- The section heading "Popular right now"
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values | FALSE
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 03_broken_image.png

### visible

- Tokumaru Ramen Bar dish preview image | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements | FALSE
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 04_pointless_zero_discount.png

### visible

- A discount badge reading "−20%" for the pizza restaurant | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- Invalid values | FALSE
- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Missing elements
- Missing translations
- Layout alignment problems
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 05_contrast_failure.png

### visible

- A "3 free deliveries for you" promotional banner with promo code TALLINN3 | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users | FALSE
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 06_missing_nav_icon.png

### visible

- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements | FALSE
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 07_state_inconsistency.png

### visible

- Tokumaru Ramen Bar dish preview image | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner | FALSE
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 08_typo_in_text.png

### visible

- The search field placeholder text "Restaurants, dishes, groceries" | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Spelling mistakes or typos | FALSE
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 09_text_truncation.png

### visible

- The full restaurant name "Tokumaru Ramen Bar" | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis | FALSE
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 10_duplicate_elements.png

### visible

- A pasta dish | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements | FALSE
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 11_impossible_discount_value.png

### visible

- A discount badge reading "−20%" for the pizza restaurant | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business | FALSE
- Missing elements
- Missing translations
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 12_overlapping_elements.png

### visible

- Tokumaru Ramen Bar delivery times | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements | FALSE
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Missing translations
- Layout alignment problems, except for overlapping text
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 13_orphaned_notification_badge.png

### visible

- A notification bell icon in the top-right corner | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements | FALSE
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 14_misalignment.png

### visible

- A "Fastest near you" section | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Layout alignment problems | FALSE
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 15_safe_area_violation.png

### visible

- Bottom navigation icons Home, Search, Orders and Profile | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- The "All" category chip highlighted as the selected filter
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 16_filter_content_mismatch.png

### visible

- The "All" category chip highlighted as the selected filter | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "Home" tab highlighted as the active tab in the bottom navigation
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues | FALSE
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE

## 17_wrong_active_nav_state.png

### visible

- The "Home" tab highlighted as the active tab in the bottom navigation | FALSE
- The section heading "Popular right now"
- The delivery address in the header
- The search field placeholder text "Restaurants, dishes, groceries"
- The full restaurant name "Tokumaru Ramen Bar"
- A notification bell icon in the top-right corner
- A red notification dot in the top-right corner
- Bottom navigation items "Home", "Search", "Orders" and "Profile" with icons
- The "All" category chip highlighted as the selected filter
- A discount badge reading "−20%" for the pizza restaurant
- A "Fastest near you" section
- A "3 free deliveries for you" promotional banner with promo code TALLINN3
- A star rating on the "Green Bowl Poké" card | FALSE
- The delivery address repeated in a footer at the bottom of the screen | FALSE

### absent

- A loading spinner
- Error messages
- Overlapping elements
- Grammatical errors
- Text cut off mid-word inside its own container, with no ellipsis
- Duplicate elements
- Content issues potentially damaging the business
- Missing elements
- Layout alignment problems
- Invalid values
- Unreadable text for visually impaired users
- Inconsistent application state issues | FALSE
- A promotional banner with an "Order now" button | FALSE
- A search input above the category chips | FALSE
