/** One in-flight dab and one latest pending sample: never queue an entire drag. */
export class SculptStroke<Sample> {
  private pending: Sample | undefined;
  private running = false;
  private ended = false;
  private cancelled = false;
  private frame: number | null = null;

  constructor(
    private readonly apply: (sample: Sample) => Promise<void>,
    private readonly settled: (error?: unknown) => void,
  ) {}

  push(sample: Sample) {
    if (this.ended || this.cancelled) return;
    this.pending = sample;
    this.schedule();
  }

  finish() {
    this.ended = true;
    this.schedule();
  }

  cancel() {
    this.cancelled = true;
    this.pending = undefined;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private schedule() {
    if (this.cancelled || this.running || this.frame !== null) return;
    if (this.pending === undefined) {
      if (this.ended) {
        this.cancelled = true;
        this.settled();
      }
      return;
    }
    // Give React and the viewport a frame to display the previous mesh before
    // picking the next point on its updated surface.
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const sample = this.pending!;
      this.pending = undefined;
      this.running = true;
      void this.run(sample);
    });
  }

  private async run(sample: Sample) {
    try {
      await this.apply(sample);
    } catch (error) {
      if (!this.cancelled) {
        this.cancel();
        this.settled(error);
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
