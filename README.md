# Sulat

A handwriting tutor for scripts the world stopped teaching. It launches with Baybayin, the pre-colonial Filipino script, and is built to work for any script, with cursive as the second.

**Learn it before you ink it.**

Built solo by Lianne Baron for the Meta Global AI Developer Hackathon, Indie track, theme "Build for Your World."

**Live app:** [sulat-7sw.pages.dev](https://sulat-7sw.pages.dev) &nbsp;|&nbsp; **Demo video:** [add link here]

## Why I'm building this

I'm Filipino-Canadian, and I'm learning Baybayin before I get my next tattoo. I want to write it properly, not just copy its shapes, and I couldn't find a way to practice writing it with real feedback. So I built one.

I'm not the only one. Baybayin is having a revival, especially among second-generation Filipinos in the diaspora, but mostly as tattoos and designs that people can't actually read or write. Sulat means "to write" in Tagalog and teaches the hand, not just the eye.

*Glyphs drawn by me, a learner, and reviewed by Baybayin calligrapher Taipan Lucero ([CalligraFilipino](https://taipzlucero.wixsite.com/taipanlucero/home)). See [Accuracy and review](#accuracy-and-review).*

## Meet Marina

Marina is the tutor. She is named for my Lola, who taught at her local school in Pampanga for more than 30 years. The word she left with me, and that I heard in my head every day while building this, is *determination*. Her look comes from Mariang Sinukuan, the generous protector of nature in Kapampangan folklore, who gifts villagers with fruit, vegetables and forest bounty. She wears sampaguita, the Philippine national flower, in her hair, and she is styled as paper cut on bamboo paper. Baybayin was originally scribed on bamboo, this is a nod to its' history. Future versions will bring in more of Mariang Sinukuan's fruit.

## How it works

Sulat works two ways, and both start at the same home page.

**On your phone**

1. Pick a phrase, or ask out loud: "How do I write I love you?"
2. **Watch** each syllable drawn stroke by stroke, with a short explanation of the letter and any mark on it.
3. **Practice:** trace along with the guide, then the guide disappears and you write each syllable from memory. Tap **Peek** if you get stuck. Marina tells you what to fix.
4. **Write it on paper.** Write the letter with a real pen, take a photo, and Marina checks it.

**With Meta Ray-Ban Display glasses**

1. The lesson plays on the lens: the syllable, a one-line explanation, and the next steps on the Neural Band's arrow keys and Enter.
2. Press down to write the letter on paper. The glasses show a four-digit code.
3. On your phone, enter the code. The phone becomes a desk camera, standing over your paper.
4. Press Enter on the glasses. The phone photographs your writing, Marina checks it, and her answer comes back to the lens: **Magaling!**, **Almost!** or **Try again**, with a tip.

## Try it

- **Home:** [sulat-7sw.pages.dev](https://sulat-7sw.pages.dev). Choose "On my phone" or "With Display glasses".
- **Show me (phone):** [animate.html](https://sulat-7sw.pages.dev/animate.html). Type a Tagalog phrase and watch it written stroke by stroke.
- **Practice:** [practice.html](https://sulat-7sw.pages.dev/practice.html). Watch, trace, then write from memory.
- **Write it on paper:** [paper.html](https://sulat-7sw.pages.dev/paper.html). Photo mode, or the glasses desk camera at [paper.html?mode=desk](https://sulat-7sw.pages.dev/paper.html?mode=desk).
- **Talk to Sulat:** [talk.html](https://sulat-7sw.pages.dev/talk.html). Hold the button and ask how to write a phrase.
- **No glasses? Preview the glasses view:** [glasses.html](https://sulat-7sw.pages.dev/glasses.html). Best on a desktop, or any window 600 × 600 or larger. Use the arrow keys and Enter.

**Add Sulat to your glasses** (a one-time setup): in your glasses' app on your phone, open **Apps**, scroll to **Web apps**, tap **Connect a web app**, enter the name `Sulat` and the address `https://sulat-7sw.pages.dev/g`, then tap Connect. The phone will warn that web apps are a developer-mode feature. The same steps are on the app's "With Display glasses" page.

## The glasses loop

The glasses and the phone share a small "room". The glasses ask for a check, the phone does it, and the answer comes back.

```
glasses: shows a 4-digit code, Enter sends "check this letter" to the room
phone (desk camera): sees the request, photographs the paper,
                     cleans the photo, asks Muse Spark for a verdict,
                     posts the verdict back to the room
glasses: show Marina's answer
```

- **Why the phone is the camera.** Meta's docs list camera and microphone as unsupported for Ray-Ban Display web apps. When I confirmed that, I pivoted: the glasses show the lesson and take the keys, and the phone, which has a camera, watches the paper. I kept the loop as short and intuitive as I could. Version two will be an iOS app that leverages the camera directly.
- **Why no QR code.** A QR code would have been a quick way to pair the phone, but the web app can't let the glasses read one. A four-digit code, shown very large on the lens, is the fallback.
- **The room.** It's a small Cloudflare D1 table (`functions/api/room.js`). Each room holds the current request and the latest answer, and rooms older than 24 hours are deleted on every write.
- **Finding the glasses.** The Ray-Ban Display opens the root address. If the window is a small square, the page jumps straight to the glasses launcher. `/g` is a short address that goes to the same place.

## Design decisions

- **Light lines on black for the glasses.** On the Ray-Ban Display, black is see-through, so dark fills turn into windows. After testing on real glasses, I landed on cream, sage and gold lines on black, large type, and nothing filled except the small keys. The glasses and phone share a palette of tan, cream and greens, with the hibiscus red-orange as the highlight.
- **Color is a signal.** As in the physical world, red means stop, amber means yield or wait, and green means go. So green is "Magaling!", gold is "Almost!" and red is reserved for "Try again". The glasses use gold to mark the key that Enter will press.
- **Marina speaks first.** Her answer replaces her instruction at the top of the screen, so the feedback is the first thing you see.
- **Keys, not touch.** The glasses take arrow keys and Enter only, so every screen has exactly one thing that Enter does, and the key row at the bottom always says what each key will do.

## Accuracy and review

Sulat is learner-built and expert-reviewed. I'm a hand-letterer, but I'm still learning Baybayin myself, so every glyph and stroke is drawn in my own hand.

On Nov 2, 2026, Baybayin calligrapher Taipan Lucero ([CalligraFilipino](https://taipzlucero.wixsite.com/taipanlucero/home)) reviewed the glyph sheet. He called the glyphs "a good starting point" and advised that a strict stroke pattern or order isn't needed, as long as characters stay similar enough to the historically recorded forms and distinguishable from each other.

This was a general review of the sheet, not a full audit of every glyph and not an endorsement of the app.

His advice changed the app. The scorer now judges whether a character is clear and distinguishable, and treats stroke order, direction and stroke count as optional tips. Marks that change the sound (the vowel dot and the cross) are still checked, because they change which character it is. The current version is `legible-2`, shown in a small stamp on the practice page. The earlier strict scorer is kept (`opts.strict`) and is the version the Nov 1 family study ran on.

## Evaluation log

**Family learning study**, Nov 1, 2026. Three family members, all new to Baybayin (a teenager, a young adult, and a grandparent in their mid-80s), learned "mahal kita" (5 syllables) in one lesson on the practice page.

Method: write the phrase on paper with no hints, take one lesson in the app, then write it again from memory on paper straight away. I scored the paper sheets by eye (right glyph and marks; shaky is fine). One rater, who is also the builder, not blinded.

- Paper before: 1 of 15 syllables right.
- Paper after: 10 of 15 (2, 5 and 3 out of 5).
- In-app first try from memory: 5 of 15. This is lower because the app counts retries, and one learner used the Check button to reveal the answer as a hint. I don't report that learner's in-app numbers, and I added a separate Peek button.

This is a pilot of three family members, not a finding. It did find real problems: all three needed exactly 3 tries to trace "ki" (a reversed guide arrow, fixed the same night), the cross mark was hard to draw, and the learners wanted undo, a hint, and to know up front that a from-memory round was coming. All of these are now built.

**Spark vision on paper photos** (Muse Spark 1.3), Oct 29. Ten attempts at ma, ka and ki, drawn correctly or wrong on purpose.

- Round 1, first prompt: 6 of 10 judged right. Spark caught every planted flaw, but called 2 of 3 correct attempts wrong, and without a reference image it misread ka as ma.
- Round 2, revised prompt ("normal handwriting varies"; never identify the glyph) plus a reference built from my own strokes: 6 of 6 judged right. Correct attempts passed with gentle tips, and it caught a middle bar that didn't connect and a vowel dot on the wrong side.

What changed in the design: Spark is never asked which glyph it's looking at. The app always gives it the target and a reference, and the deterministic stroke scorer has the final say on traced input.

**Voice input speed**, Oct 31, measured on a phone and from the live site.

- Transcription (Muse Voice Transcribe): 0.8 to 1.3 s.
- Working out the phrase (Muse Spark 1.3 with a `start_lesson` tool): setting reasoning effort to "low" cut a new translation from about 3.4 s to 1.4 s (3 runs each), with the same answer every time.

**Paper mode, live**, Nov 2. Thin pen on grey paper was invisible to the model once shrunk: 3 of 3 photos came back "looks blank". A clean-up step (find the ink against the local paper brightness, crop to the letter, redraw it bold on white) fixed it. Then 7 live judgments were all correct: neat and loose ma passed, ki and a dotless ka sent as ma were sent back. One failed until the token budget went from 3,000 to 6,000, because Spark spends 1,400 to 2,500 tokens reasoning per photo. Each judgment takes 6 to 11 seconds. One tip named the wrong letter ("reads as ha", it was ka), so tips can no longer name other letters.

**The glasses loop on real glasses.** Pavlo, a friend with a real pair of Ray-Ban Display glasses, ran the full loop: watch on the lens, write on paper, pair the phone with the code, and get Marina's answer back on the lens. Text and audio were clear and legible through the lens, and he reported that the display looks washed out on screen recordings but is crisp in the glasses. He celebrated the ones he got right and learned from Marina's feedback on the ones he got wrong. The part that took the most getting used to was using the phone as the camera and typing the code.

- **A bug that every first-time user would have hit.** Testing the redesign on a fresh room code, the glasses' first check never got an answer, and the glasses waited out their 90 seconds ("No answer from the phone"). The desk camera is meant to ignore any old request already waiting in the room when it starts. But it only stopped ignoring after it had seen one request, so in a brand-new room the first real request was ignored too. Pressing Enter a second time worked. It had been invisible because my production room already held old requests. Fixed in `paper.html`, and verified on a new code: the first Enter now returns a verdict.
- **Timing.** Five checks on Nov 3 and 4 took 13.6, 13.7, 15.5, 20.0 and 38.3 seconds. The range I've seen overall is 6 to 48 seconds, so the screens show Marina "reading", not a fake progress bar.
- **A noisy capture.** One test photo was badly set up, and the cleaned image Sulat passed along was mostly noise. The verdict was still "Looks right!", presumably because the model also sees the original frame. That's a real limit: a messy photo can still pass.

## Known limits

- The glasses can't use their own camera or microphone from a web app, so the phone is the camera. Pairing needs a four-digit code.
- A check takes 6 to 48 seconds, depending on the model.
- A messy photo can still get "Looks right!".
- Browsers block sound until you tap the page, so the first phrase on a page can load silent. Replay brings it back. A sound on/off setting is remembered on each device.
- Audio is whole phrases only, recorded by my mother. The glasses play the phrase clip each time you press Enter, not just the syllable on screen.
- The paper check is advisory. The model is always told the target and given a reference, but its verdict can still be wrong, which is why traced input is judged by the deterministic stroke scorer instead.
- Cursive and Calligraphy are shown as "soon". Baybayin is the only script so far.
- The glasses screens were designed for 600 × 600. On a phone, the glasses preview is wider than the screen.

## What's next

- Version two: an iOS app that leverages the camera directly, beyond what a web app can do on the glasses.
- A square, camera-style preview, with the photo cropped to the same square it shows.
- Syllable-by-syllable audio, and a sound on/off tile on the glasses.
- Communicating with Marina through audio on the glasses and in phone lessons.
- A whole-phrase finish on the glasses, where Marina writes the full phrase after the last letter.
- More phrases, then Cursive, then Calligraphy, then other scripts the world stopped teaching.

## Status

- Oct 28, 2026: repo created, hello page live at sulat-7sw.pages.dev, stroke-capture page added (`capture.html`)
- Oct 29, 2026: all 20 glyphs and 3 marks recorded by hand (`packs/baybayin.json`); Sulat engine and Show me page (`animate.html`); first Spark vision test on paper
- Oct 31, 2026: voice input (`talk.html`, `functions/api/`): speech to Tagalog phrase to Show me, working end to end on a phone
- Oct 31, 2026: confirmed on real Ray-Ban Display glasses (Pavlo's pair): smooth stroke animation, Band input as arrow keys and Select.
- Nov 1, 2026: removed a pen-landing hook from ka stroke 3 and the cross mark. Found by the family study: all three learners needed exactly 3 tries to trace ki because the guide arrow pointed the wrong way.
- Nov 1, 2026: family learning study (see Evaluation log)
- Nov 2, 2026: Baybayin calligrapher review; scorer changed to judge legibility; added Undo, Peek, and fail reasons to the practice page
- Nov 2, 2026: glasses diagnostic page (`glasses-check.html`) to test keys, brightness, and sound on real glasses
- Nov 2 to 3, 2026: the glasses loop: a shared room on Cloudflare D1 (`functions/api/room.js`), desk-camera mode in `paper.html`, and Marina's verdicts returning to the lens
- Nov 3, 2026: found and fixed the first-check bug (see Evaluation log)
- Nov 3 to 4, 2026: redesign: Marina, the palette, glasses screens drawn in light lines, the new home page and glasses setup page, Show me, Practice and paper restyled, sound toggle, and the sampaguita app icon
- Nov 4, 2026: demo video and submission

## Built during the event

- **With Claude (Anthropic):**
  - The hello page, the stroke-capture page, the Sulat engine (`sulat-engine.js`), the Show me page, the stroke scorer (`sulat-score.js`), the practice page, the glasses views and diagnostic page, the test suite, and the glyph review sheet.
  - The Nov 3 to 4 redesign: the design direction, Marina's screens, the glasses launcher, Show me, try, checking and verdict screens, the phone home and setup pages, and the restyled Practice and paper pages.
- **With Meta's Muse Code:**
  - Voice input (`functions/api/transcribe.js`, `functions/api/intent.js`, `talk.html`), plus fixes for starter-phrase matching, iPhone mic reconnection, and the reasoning-speed change.
  - The glasses loop: the shared room (`functions/api/room.js`) and desk-camera mode in `paper.html`, and the first-check fix.
  - On Nov 2 it also ran a read-only audit of the repo, which flagged README claims the code didn't back up. I fixed them.

## Assets and credits

- **Wordmark and glyphs:** hand-lettered and hand-drawn by me. The glyphs were reviewed by Baybayin calligrapher Taipan Lucero.
- **Marina and the sampaguita artwork:** AI-generated. I sketched the idea of the character and described the style (paper cut, on bamboo paper, with sampaguita), and an AI image tool rendered options from my sketch. I chose one and cleaned it up for the app. <!-- TODO: name the image tool here. -->
- **Audio:** the six phrase clips (`audio/`) were recorded by my mother.
- **Fonts:** [Figtree](https://github.com/erikdkennedy/figtree) and [Caveat](https://github.com/googlefonts/caveat), both under the SIL Open Font License 1.1. Their licences are in `fonts/`.
- **Glyph review:** Taipan Lucero, CalligraFilipino.

## Privacy

- **Paper photos.** The page cleans your photo in your browser, then sends it, with a reference drawing of the target letter, to `functions/api/paper.js`, which asks Muse Spark for a verdict. The function doesn't store or log images, and returns only the verdict and up to two tips. The model is Meta's, so Meta's own handling of API requests applies.
- **Rooms.** A glasses room holds a four-digit code, the letter being checked, and the latest verdict and tips. There are no photos, accounts or names. Rooms older than 24 hours are deleted. Anyone who types a code can join that room, so the codes are for pairing, not for secrecy.
- **Voice.** The short clip is forwarded to Meta's Muse Voice Transcribe, and the resulting text to Muse Spark, to find the phrase. Sulat's own functions pass them along and don't save them.
- **On your device.** Your browser's local storage keeps your practice results, the glasses' room code and the sound setting.
- **API key.** The Muse Spark key stays in the host's settings and is never in the browser.

## Stack

- Meta Muse Spark 1.3: understanding the request with tool calling, and vision feedback on handwriting, evaluated in the log above
- Muse Voice Transcribe: speech input
- Muse Code: development workflow
- Meta Ray-Ban Display web app and Neural Band: interface
- Cloudflare Pages and Pages Functions: hosting, with the API key kept server-side
- Cloudflare D1: the shared room for the glasses loop

This list will grow into a full "Tools considered" note as the build proceeds.
