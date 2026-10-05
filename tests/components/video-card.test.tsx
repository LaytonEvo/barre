import './render.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VideoCard, type LibraryVideo } from '@/components/videos/video-card';

/**
 * The card has to answer "have I done this one, and where did I get to" at a
 * glance, because that is what a member scanning a shelf of 30 videos is doing.
 */
function video(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Express Arms',
    slug: 'express-arms',
    duration_secs: 20 * 60,
    level: 'all_levels',
    category_name: 'Express',
    equipment: [],
    is_new: false,
    position_secs: 0,
    completed_at: null,
    is_favourite: false,
    safe_for_pregnancy: false,
    ...overrides,
  };
}

const render = (v: LibraryVideo) => renderToStaticMarkup(<VideoCard video={v} />);

describe('VideoCard', () => {
  it('links to the video by slug', () => {
    expect(render(video())).toContain('href="/account/videos/express-arms"');
  });

  it('shows the duration in minutes', () => {
    expect(render(video())).toContain('20 min');
  });

  it('says "No equipment" rather than leaving it blank', () => {
    // A blank line reads as missing data; "No equipment" is the useful answer and
    // is often the deciding factor for someone in a hotel room.
    expect(render(video())).toContain('No equipment');
  });

  it('lists the equipment when there is some', () => {
    expect(render(video({ equipment: ['mat', 'small ball'] }))).toContain('mat, small ball');
  });

  it('shows how far through a part-watched video is', () => {
    const html = render(video({ position_secs: 10 * 60 }));
    expect(html).toContain('50% watched');
    expect(html).toContain('width:50%');
  });

  it('does not show a progress bar for a video barely started', () => {
    // 1% would render a sliver that looks like a rendering artefact.
    expect(render(video({ position_secs: 5 }))).not.toContain('watched');
  });

  it('marks a completed video as done and drops the progress bar', () => {
    const html = render(video({ completed_at: '2026-10-01T10:00:00Z', position_secs: 1200 }));
    expect(html).toContain('Done');
    expect(html).not.toContain('watched');
  });

  it('shows New only on something untouched', () => {
    expect(render(video({ is_new: true }))).toContain('New');
    // Once you have started it, "New" is noise — you already know about it.
    expect(render(video({ is_new: true, position_secs: 600 }))).not.toContain('>New<');
  });

  it('marks a saved video', () => {
    expect(render(video({ is_favourite: true }))).toContain('Saved');
  });

  it('caps the progress bar at 100% when the position exceeds the duration', () => {
    const html = render(video({ position_secs: 99999, duration_secs: 600 }));
    expect(html).toContain('width:100%');
    expect(html).not.toContain('width:16666');
  });

  it('survives a missing duration without rendering "NaN"', () => {
    const html = render(video({ duration_secs: null, position_secs: 100 }));
    expect(html).not.toContain('NaN');
  });
});
