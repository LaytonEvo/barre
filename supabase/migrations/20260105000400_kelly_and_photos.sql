-- =============================================================================
-- Kelly's name, bio and photography. Supplied by Layton 2026-10-05.
--
-- The bio is Kelly's own words, stored verbatim. It is deliberately NOT edited
-- to match the timetable — see the note below.
-- =============================================================================

update public.instructors set
  display_name = 'Kelly Brooks',
  slug         = 'kelly-brooks',
  photo_path   = '/images/kelly-portrait.jpg',
  bio = E'Barre by Kelly is a friendly, local barre class based at St Leonards & St Ives '
        'Village Hall, just outside Ringwood. Each session blends the grace of ballet with '
        'the control of Pilates, the flexibility of yoga and the strength of resistance '
        'work. It''s low impact and kind on the joints, but don''t be fooled: you''ll feel '
        'it for days.\n\n'
        'Kelly runs evening classes at 6:30pm and 7:30pm, with occasional pop-up sessions. '
        'Whether you''re a former dancer or have never set foot near a barre, you''ll be '
        'welcomed, encouraged and pushed just the right amount.\n\n'
        'See you at the barre!'
  where slug = 'kelly';

-- NOTE FOR REVIEW -------------------------------------------------------------
-- The bio says the class is "based at St Leonards & St Ives Village Hall" and
-- mentions "evening classes at 6:30pm and 7:30pm". Both are true of Mondays,
-- but the timetable also has Thursday 19:15 at St Ives Primary School, which
-- the bio does not mention.
--
-- Kelly's copy is left exactly as she wrote it rather than quietly edited, since
-- it is her voice and she may have written it before the Thursday class existed.
-- The timetable, the locations pages and the footer all carry both venues, so a
-- visitor is not misled — but it is worth her adding a line. Tracked as question
-- A2a in docs/03-OPEN-QUESTIONS.md.
-- -----------------------------------------------------------------------------

-- Qualifications remain empty. Still never inferred: the Person structured data
-- omits hasCredential entirely while this array is empty, and a test pins that.

-- -----------------------------------------------------------------------------
-- Class imagery.
--
-- The studio shots are the clearest "this is what it actually is" pictures, so
-- the class type gets one of those rather than a lifestyle shot.
-- -----------------------------------------------------------------------------
update public.class_types set
  hero_image_path = '/images/kelly-barre-floor.jpg',
  long_description = E'A warm-up, then work through arms, legs, seat and core, finishing '
    'with a stretch. The movements are small and repeated, usually holding the barre or a '
    'chair for balance, and there is no choreography to learn.\n\n'
    'Kelly shows an easier and a harder version of almost everything, so you choose as you '
    'go — often differently from one side to the other. Your legs will shake. That is the '
    'point, and it happens to everyone.'
  where slug = 'barre';

-- -----------------------------------------------------------------------------
-- Venue photography: none supplied.
--
-- Every photo in the set is either Kelly outdoors or a studio with a proper
-- ballet barre — none shows either village hall. The venue pages therefore keep
-- their honest empty state rather than showing a hall that is not the hall.
-- Tracked as question A8a.
-- -----------------------------------------------------------------------------
