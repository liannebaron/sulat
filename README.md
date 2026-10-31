# Sulat
 
A handwriting tutor for scripts the world stopped teaching. It launches with Baybayin, the pre-colonial Filipino script, and is built to work for any script, with cursive as the second.
 
**Learn it before you ink it.**
 
Built solo by Lianne Baron for the Meta Global AI Developer Hackathon, Indie track, theme "Build for Your World."
 
## Why I'm building this
 
I'm Filipino-Canadian, and I'm learning Baybayin before I get my next tattoo. I want to write it properly, not just copy its shapes, and I couldn't find a way to practice writing it with real feedback. So I'm building one.
 
I'm not the only one. Baybayin is having a revival, especially among second-generation Filipinos in the diaspora, but mostly as tattoos and designs that people can't actually read or write. Sulat teaches the hand, not just the eye.
 
## How it works
 
1. Ask out loud: "How do I write I love you?"
2. Hear the phrase in Tagalog, *mahal kita*, and watch each glyph drawn stroke by stroke.
3. **Show me:** trace along with the guide.
4. **You try:** the guide disappears, you write from memory, and Sulat catches one specific slip.
It's built for a phone and for Meta Ray-Ban Display glasses.
 
## Learner-built, expert-reviewed
 
I'm a hand-letterer, but I'm still learning Baybayin myself. The glyphs and stroke order in this project are drawn in my own hand, so I'm asking Baybayin practitioners to review them. I'll credit them here once they have.
 
## Status
 
- Oct 28, 2026: repo created, hello page live at sulat-7sw.pages.dev, stroke-capture page added (`capture.html`)
- Oct 29, 2026: all 20 glyphs and 3 marks recorded by hand (packs/baybayin.json); Sulat engine and Show me page (animate.html); first Spark vision test on paper

## Built during the event
 
Everything in this repository is created during the hackathon window (Oct 26 to Nov 4, 2026), with timestamped commits. The only pre-existing work is a small API proxy pattern from my own site, baybayinscript.com, which will be disclosed here if any of it is reused.
 
How it’s built: the hello page, stroke-capture page, Sulat engine, Show me page and glyph review sheet were built with Claude (Anthropic). Meta’s Muse Code will build the platform-specific pieces (voice input and Spark tool-calling), and this section records which tool did what.

## Evaluation log

Spark vision on paper photos (Muse Spark 1.3), Oct 29, 2026. Ten attempts at ma, ka and ki, drawn correctly or wrong on purpose.

- Round 1, first prompt: 5 of 10 judged right. Spark caught every planted flaw, but flagged 3 of 4 correct attempts as wrong, and without a reference image it misread ka as ma.
- Round 2, revised prompt ("normal handwriting varies"; never identify the glyph) plus a reference built from my own strokes: 5 of 6 judged right. Correct attempts passed with gentle tips, and a vowel dot on the wrong side was caught.

What changed in the design: Spark is never asked which glyph it's looking at. The app always gives it the target and a reference, and the deterministic stroke scorer has the final say on traced input.
 
## Planned stack
 
- Meta Muse Spark 1.3 (the lesson agent with tool calling, and vision feedback)
- Muse Voice Transcribe (speech input)
- Muse Code (development workflow)
- Meta Ray-Ban Display web app and Neural Band (interface)
- Cloudflare Pages and Workers (hosting and API proxy)

This list will grow into a full "Tools considered" note as the build proceeds.
