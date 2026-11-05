-- Stories Instagram / Facebook (photo ou vidéo).
-- Une story est enregistrée dans « posts » comme un post, avec kind = 'story'.
-- « image_url » contient alors le chemin du fichier (photo OU vidéo) dans le bucket privé.
alter table public.posts
  add column if not exists kind text not null default 'post' check (kind in ('post', 'story')),
  add column if not exists media_type text not null default 'photo' check (media_type in ('photo', 'video'));

-- Le bucket privé accepte aussi les vidéos de story (MP4 / MOV, comme le demande Meta), 50 Mo max.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
      file_size_limit = 52428800
  where id = 'post-images';
