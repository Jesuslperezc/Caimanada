import { getTimerConfig } from './sport-terms.js';

export class MatchChronometer {
  constructor(sportId) {
    this.config = getTimerConfig(sportId);
    this.reset();
  }

  reset() {
    this.currentTime = this.config.hasClock ? (this.config.periodDuration || 0) : 0;
    this.currentPeriodIndex = 0;
    this.isRunning = false;
    this.isBreak = false;
    this.hasStarted = false;
    this.finished = false;
    this.intervalId = null;
  }

  get currentPeriodName() {
    const prefix = this.isBreak ? 'Descanso - ' : '';
    return prefix + (this.config.periodNames[this.currentPeriodIndex] || 'Final');
  }

  get formattedTime() {
    const totalSeconds = Math.max(0, this.currentTime);
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  start() {
    if (this.finished || this.isRunning) return;
    this.isRunning = true;
    this.hasStarted = true;
    this.intervalId = setInterval(() => {
      if (this.config.hasClock) {
        this.currentTime--;
        if (this.currentTime <= 0) { this.currentTime = 0; this.pause(); }
      } else {
        this.currentTime++;
      }
      if (this.onTick) this.onTick(this.getState());
    }, 1000);
  }

  pause() {
    this.isRunning = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.onTick) this.onTick(this.getState());
  }

  nextPeriod() {
    this.pause();
    if (this.currentPeriodIndex < this.config.periods - 1) {
      this.currentPeriodIndex++;
      this.currentTime = this.config.hasClock ? (this.config.periodDuration || 0) : 0;
      this.isBreak = false;
      if (this.onPeriodChange) this.onPeriodChange(this.getState());
    } else {
      this.finished = true;
      if (this.onFinish) this.onFinish(this.getState());
    }
  }

  startBreak(isLongBreak = false) {
    this.pause();
    this.isBreak = true;
    
    // Si es Voleibol/PingPong 
    if (!this.config.hasClock && this.config.breakDuration > 0) {
      this.currentTime = this.config.breakDuration;
      this.isRunning = true;
      this.intervalId = setInterval(() => {
        this.currentTime--;
        if (this.onTick) this.onTick(this.getState());
        if (this.currentTime <= 0) {
          this.pause();
          this.isBreak = false;
          this.nextPeriod(); 
        }
      }, 1000);
      if (this.onPeriodChange) this.onPeriodChange(this.getState());
      return;
    }

    // Si no tiene descanso
    if (!this.config.hasClock) {
      if (this.onPeriodChange) this.onPeriodChange(this.getState());
      return;
    }

    // Descanso normal con cuenta regresiva (Fútbol, Básquet)
    this.currentTime = isLongBreak && this.config.breakDurationLong ? this.config.breakDurationLong : this.config.breakDuration;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.currentTime--;
      if (this.onTick) this.onTick(this.getState());
      if (this.currentTime <= 0) {
        this.pause();
        this.isBreak = false;
        this.nextPeriod();
      }
    }, 1000);
  }

  getState() {
    return {
      currentTime: this.currentTime,
      formattedTime: this.formattedTime,
      currentPeriodIndex: this.currentPeriodIndex,
      currentPeriodName: this.currentPeriodName,
      isRunning: this.isRunning,
      isBreak: this.isBreak,
      hasStarted: this.hasStarted,
      finished: this.finished
    };
  }

  destroy() {
    this.pause();
    this.onTick = null; this.onPeriodChange = null; this.onFinish = null;
  }
}