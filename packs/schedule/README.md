# schedule

Clock-fired runs. One node: `cron` — a five-field cron trigger that never
claims an HTTP route (no `routeClaim`; the clock surface fires it). The node
validates the declared expression structurally and pins the delivered fire
instant on the `scheduledAt` port as canonical ISO. Scheduling math belongs
to the clock surface that fires the run — never to pack code.
