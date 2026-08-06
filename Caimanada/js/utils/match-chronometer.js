import { getTimerConfig } from './sport-terms.js';

export class MatchChronometer {
  constructor(sportId) {
    this.config = getTimerConfig(sportId);
    this.reset();
  }

  reset() {
    this.currentTime = 0; 
    this.currentPeriodIndex = 0;
    this.isRunning = false;
    this.isBreak = false;
    this.timeoutActive = { home: false, away: false };
    this.finished = false;
    this.intervalId = null;
  }

  get currentPeriodName() {
    const prefix = this.isBreak ? 'Descanso - ' : '';
    return prefix + (this.config.periodNames[this.currentPeriodIndex] || 'Final');
  }

  get formattedTime() {
    const mins = Math.floor(this.currentTime / 60).toString().padStart(2, '0');
    const secs = (this.currentTime % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  start() {
    if (this.finished || this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.currentTime++;
      if (this.config.hasClock && this.currentTime >= this.config.periodDuration) {
        this.pause();
      }
      if (this.onTick) this.onTick(this.getState());
    }, 1000);
  }

  pause() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.onTick) this.onTick(this.getState());
  }

  // Avanzar al siguiente periodo
  nextPeriod() {
    this.pause();
    if (this.currentPeriodIndex < this.config.periods - 1) {
      this.currentPeriodIndex++;
      this.currentTime = 0;
      this.isBreak = false;
      if (this.onPeriodChange) this.onPeriodChange(this.getState());
    } else {
      this.finished = true;
      if (this.onFinish) this.onFinish(this.getState());
    }
  }

  // Iniciar el descanso
  startBreak(isLongBreak = false) {
    this.pause();
    this.isBreak = true;
    if (!this.config.hasClock) {
      // En deportes a puntos 
      if (this.onPeriodChange) this.onPeriodChange(this.getState());
      return;
    }
    // En deportes con reloj
    this.currentTime = 0;
    const breakTime = (isLongBreak && this.config.breakDurationLong) ? this.config.breakDurationLong : this.config.breakDuration;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.currentTime++;
      if (this.onTick) this.onTick(this.getState());
      if (this.currentTime >= breakTime) {
        this.pause();
        this.isBreak = false;
        this.currentTime = 0;
        if (this.onPeriodChange) this.onPeriodChange(this.getState());
      }
    }, 1000);
  }

  toggleTimeout(team) {
    if (!this.timeoutActive[team]) {
      this.pause(); 
      this.timeoutActive[team] = true;
    } else {
      this.timeoutActive[team] = false;
    }
    if (this.onTimeout) this.onTimeout(team, this.timeoutActive[team], this.getState());
  }

  getState() {
    return {
      currentTime: this.currentTime,
      formattedTime: this.formattedTime,
      currentPeriodIndex: this.currentPeriodIndex,
      currentPeriodName: this.currentPeriodName,
      isRunning: this.isRunning,
      isBreak: this.isBreak,
      finished: this.finished,
      timeoutActive: this.timeoutActive
    };
  }

  destroy() {
    this.pause();
    this.onTick = null;
    this.onPeriodChange = null;
    this.onFinish = null;
  }
}
