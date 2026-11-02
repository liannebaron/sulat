# Sulat

A handwriting tutor for scripts the world stopped teaching. It launches with Baybayin, the pre-colonial Filipino script, and is built to work for any script, with cursive as the second.

**Learn it before you ink it.**

Built solo by Lianne Baron for the Meta Global AI Developer Hackathon, Indie track, theme "Build for Your World."

## Why I'm building this

I'm Filipino-Canadian, and I'm learning Baybayin before I get my next tattoo. I want to write it properly, not just copy its shapes, and I couldn't find a way to practice writing it with real feedback. So I'm building one.

I'm not the only one. Baybayin is having a revival, especially among second-generation Filipinos in the diaspora, but mostly as tattoos and designs that people can't actually read or write. Sulat teaches the hand, not just the eye.

*Glyphs drawn by me, a learner, and reviewed by Baybayin calligrapher Taipan Lucero ([CalligraFilipino](https://taipzlucero.wixsite.com/taipanlucero/home)). See [Accuracy and review](#accuracy-and-review).*

## How it works

1. Ask out loud: "How do I write I love you?"
2. See the phrase in Tagalog, *mahal kita*, and watch each glyph drawn stroke by stroke.
3. **Show me:** trace along with the guide.
4. **You try:** the guide disappears, you write from memory, and Sulat catches one specific slip.

It's built for a phone and for Meta Ray-Ban Display glasses.

## Try it

- **Talk to Sulat:** [talk.html](https://sulat-7sw.pages.dev/talk.html). Hold the button and ask how to write a phrase.
- **Show me:** [animate.html](https://sulat-7sw.pages.dev/animate.html). Type a Tagalog phrase and watch it written stroke by stroke.
- **Glasses view:** [animate.html?view=glasses](https://sulat-7sw.pages.dev/animate.html?view=glasses). A 600×600 view, one word per card. Arrow keys move between words and Enter replays, which is what the Neural Band sends.
- **Stroke capture:** [capture.html](https://sulat-7sw.pages.dev/capture.html). The page I used to record every glyph in my own hand.
- **Practice:** [practice.html](https://sulat-7sw.pages.dev/practice.html). Watch, trace, then write from memory with specific feedback.

## Accuracy and review

Sulat is learner-built and expert-reviewed. I'm a hand-letterer, but I'm still learning Baybayin myself, so every glyph and stroke is drawn in my own hand.

On Nov 2, 2026, Baybayin calligrapher Taipan Lucero ([CalligraFilipino](https://taipzlucero.wixsite.com/taipanlucero/home)) reviewed the glyph sheet. He called the glyphs "a good starting point" and advised that a strict stroke pattern or order isn't needed, as long as characters stay similar enough to the historically recorded forms and distinguishable from each other.

This was a general review of the sheet, not a full audit of every glyph and not an endorsement of the app.

His advice changed the app. The scorer (`legible-1`) now judges whether a character is clear and distinguishable, and treats stroke order, direction and stroke count as optional tips. Marks that change the sound (the vowel dot and the cross) are still checked, because they change which character it is. The earlier strict scorer is kept (`opts.strict`) and is the version the Nov 1 family study ran on.

## Status

- Oct 28, 2026: repo created, hello page live at sulat-7sw.pages.dev, stroke-capture page added (`capture.html`)
- Oct 29, 2026: all 20 glyphs and 3 marks recorded by hand (`packs/baybayin.json`); Sulat engine and Show me page (`animate.html`); first Spark vision test on paper
- Oct 31, 2026: voice input (`talk.html`, `functions/api/`): speech to Tagalog phrase to Show me, working end to end on a phone
- Oct 31, 2026: confirmed on real Ray-Ban Display glasses (Pavlo’s pair): smooth stroke animation, Band input as arrow keys and Select.
- Nov 1, 2026: removed a pen-landing hook from ka stroke 3 and the cross mark. Found by the family study: all three learners needed exactly 3 tries to trace ki because the guide arrow pointed the wrong way.
- Nov 1, 2026: family learning study (see Evaluation log)
- Nov 2, 2026: Baybayin calligrapher review; scorer changed to judge legibility (`legible-1`); added Undo, Peek, and fail reasons to the practice page
- Nov 2, 2026: glasses diagnostic page (`glasses-check.html`) to test keys, brightness, and sound on real glasses

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

## Built during the event

- **With Claude (Anthropic):** the hello page, the stroke-capture page, the Sulat engine (`sulat-engine.js`), the Show me page, the stroke scorer (`sulat-score.js`), the practice page, the glasses views and diagnostic page, the test suite, and the glyph review sheet.
- **With Meta's Muse Code:** voice input (`functions/api/transcribe.js`, `functions/api/intent.js`, `talk.html`), plus fixes for starter-phrase matching, iPhone mic reconnection, and the reasoning-speed change. On Nov 2 it also ran a read-only audit of the repo, which flagged README claims the code didn't back up. I fixed them.

How it's built:

- **With Claude (Anthropic):** the hello page, the stroke-capture page, the Sulat engine (`sulat-engine.js`), the Show me page, and the glyph review sheet.
- **With Meta's Muse Code:** voice input: `functions/api/transcribe.js`, `functions/api/intent.js` and `talk.html`, plus fixes for starter-phrase matching, iPhone mic reconnection, and the reasoning-speed change.

Platform note: Meta’s docs list camera and microphone as unsupported for Ray-Ban Display Web Apps (updated Aug 4, 2026). Sulat works within that: the phone captures speech and handwriting, and the glasses display the lesson.

## Stack

- Meta Muse Spark 1.3: understanding the request with tool calling, and and vision feedback on handwriting, evaluated in the log below
- Muse Voice Transcribe: speech input
- Muse Code: development workflow
- Meta Ray-Ban Display web app and Neural Band: interface
- Cloudflare Pages and Pages Functions: hosting, with the API key kept server-side

This list will grow into a full "Tools considered" note as the build proceeds.
