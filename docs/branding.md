# LuggEase icon

Source reference: `frontend/assets/images/Lugg-Ease-Icon.jpeg` supplied by the owner. Original retained. The selected artwork uses the two suitcases, duffel bag, pins and route from this reference, recolored to an airy ivory/peach background with apricot and soft orange luggage and coral accents. The exact wordmark `LuggEase` appears underneath in brand orange. The darker first-reference render is not used.

Created with the built-in image generation/editing tool. Final master: `frontend/assets/branding/luggease-icon-master.png`; in-app rendition: `frontend/assets/branding/luggease-icon.png`.

## Applied assets

- Shared in-app BrandIcon on login, onboarding, customer/partner/admin home screens, bookings, profile and shared screen headers.
- Web favicons, Apple touch icon and installable web manifest icons.
- iPhone/iPad AppIcon catalog and opaque 1024-pixel marketing icon.
- Android legacy launcher sizes and adaptive launcher icons, with inset foreground artwork to keep the wordmark and luggage within launcher masks.
- Existing conventional icon asset filenames updated to the same artwork.

Exports use `frontend/scripts/export-brand-icons.py` and macOS sips for deterministic size conversion. This export script does not generate or recolor the design. Master artwork is opaque; native icon exports must remain opaque. UI renditions are smaller to avoid loading the full master on every screen.

## Final editing prompt

Edit only the provided LIGHT peach Lugg-Ease icon. Add the exact application name "LuggEase" centered at the bottom beneath the luggage and travel trail, in a bold clean rounded sans-serif wordmark, burnt orange #CC5500. Spell it exactly L-u-g-g-E-a-s-e, with uppercase L and uppercase E only. Make the wordmark large and crisp, approximately 60% of the canvas width, centered around 85% canvas height, with generous space from the travel trail. Preserve the existing airy ivory/pale peach background, pastel orange/apricot luggage, coral pins, glowing route, 3D detail, two suitcases and duffel bag. If needed, move the existing illustration slightly upward as a single group to make room, without cropping or removing any element. Keep the wordmark and illustration within mobile launcher safe margins, clear of the rounded corners. Square, opaque full-bleed icon, no outer border, no dark background, no other text or watermark.
