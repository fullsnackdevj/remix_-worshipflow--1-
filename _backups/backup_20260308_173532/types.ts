export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  chords: string;
  tags: Tag[];
  video_url?: string;
  created_at: string;
  updated_at: string;
}
