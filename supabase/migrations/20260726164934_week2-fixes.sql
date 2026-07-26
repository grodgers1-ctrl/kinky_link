-- Add missing FK on email_events.sequence_id
ALTER TABLE email_events
  ADD CONSTRAINT email_events_sequence_id_fkey
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_email_events_sequence ON email_events(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_progress_prospect ON sequence_progress(prospect_id);
