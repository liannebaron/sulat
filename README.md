# Sulat

A handwriting tutor for scripts the world stopped teaching. It launches with Baybayin, the pre-colonial Filipino script, and proves portability with cursive.

Built solo for the Meta Global AI Developer Hackathon, Indie track, theme "Build for Your World."

## The idea

People wear Baybayin as tattoos and on shirts, but almost nobody can write it. Sulat teaches the hand, not just the eye:

1. Ask out loud, "How do I write I love you?"
2. Hear the phrase in Tagalog and watch each glyph drawn stroke by stroke.
3. **Show me:** trace along with the guide.
4. **You try:** the guide disappears, you write from memory, and Sulat catches one specific slip.

It runs on a phone and on Meta Ray-Ban Display glasses.

## Status

Day 1 (Oct 26, 2026): repo created, hello page deployed.

## Built during the event

Everything in this repository is created during the hackathon window (Oct 26 to Nov 4, 2026), with timestamped commits. The only pre-existing work is a small API proxy pattern from my own site, baybayinscript.com, which will be disclosed here if any of it is reused.

## Planned stack

- Meta Muse Spark 1.3 (lesson agent with tool calling, and vision feedback)
- Muse Voice Transcribe (speech input)
- Muse Code (development workflow)
- Meta Ray-Ban Display web app and Neural Band (interface)
- Cloudflare Pages and Workers (hosting and API proxy)

This list will grow into a full "Tools considered" note as the build proceeds.
