-- Storage policies for the private review-videos bucket
DROP POLICY IF EXISTS "review_videos_select" ON storage.objects;
DROP POLICY IF EXISTS "review_videos_insert" ON storage.objects;
DROP POLICY IF EXISTS "review_videos_delete" ON storage.objects;

CREATE POLICY "review_videos_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'review-videos');

CREATE POLICY "review_videos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "review_videos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);