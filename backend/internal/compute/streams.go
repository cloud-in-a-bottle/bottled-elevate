package compute

import (
	"math"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// StreamParams describes the activity whose streams are being shaped.
type StreamParams struct {
	Type          string
	HasPowerMeter bool
	IsSwimPool    bool
	Weight        float64
}

// ProcessStreams cleans raw sensor streams for both stats computation and display: smooths
// altitude, recomputes grade, smooths/clamps speed, derives grade-adjusted speed, estimates power
// when there is no power meter, and de-spikes HR and cadence. The input is not modified.
func ProcessStreams(in *model.Streams, p StreamParams) *model.Streams {
	if in == nil {
		return nil
	}
	s := in.Clone()
	smoothAltitude(s)
	computeGrade(s)
	if len(s.VelocitySmooth) > 0 && !p.IsSwimPool {
		s.VelocitySmooth = MeanWindowSmoothing(s.VelocitySmooth, 3, 3)
	}
	shapePacedVelocities(s, p)
	computeGradeAdjustedSpeed(s, p)
	if !p.HasPowerMeter && len(s.LatLng) > 0 {
		s.Watts = estimatedPowerStream(s, p)
	}
	if len(s.Watts) > 0 {
		maxWatts := 30 * p.Weight
		for i, w := range s.Watts {
			s.Watts[i] = math.Min(w, maxWatts)
		}
	}
	if len(s.Heartrate) > 0 {
		s.Heartrate = shapeSensor(s.Heartrate, 250)
	}
	if len(s.Cadence) > 0 {
		s.Cadence = shapeSensor(s.Cadence, 250)
	}
	return s
}

func shapeSensor(a []float64, maxValue float64) []float64 {
	out := make([]float64, len(a))
	for i, v := range a {
		out[i] = math.Min(v, maxValue)
	}
	out = MedianFilter(out, 3)
	return MeanWindowSmoothing(out, 3, 3)
}

func smoothAltitude(s *model.Streams) {
	if len(s.Altitude) > 0 {
		s.Altitude = LowPassSmooth(MedianFilter(s.Altitude, 3), 0.5)
	}
}

// computeGrade derives grade from altitude over at least 10m ahead, then Kalman-smooths it.
func computeGrade(s *model.Streams) {
	const gradeClamp = 50.0
	const aheadMinMeters = 10.0
	n := len(s.Distance)
	if n == 0 || len(s.Altitude) == 0 {
		return
	}
	if len(s.Altitude) < n {
		n = len(s.Altitude)
	}
	grade := make([]float64, n)
	ahead := 0
	for i := 0; i < n; i++ {
		if ahead < i {
			ahead = i
		}
		for ahead < n && s.Distance[ahead] < s.Distance[i]+aheadMinMeters {
			ahead++
		}
		j := ahead
		if j >= n {
			j = n - 1
		}
		dd := s.Distance[j] - s.Distance[i]
		da := s.Altitude[j] - s.Altitude[i]
		g := 0.0
		if dd > 0 {
			g = Clamp(Round(da/dd*100, 2), -gradeClamp, gradeClamp)
		}
		grade[i] = g
	}
	s.GradeSmooth = KalmanApply(grade, 0.01, 0.5)
}

func clampStream(a []float64, lo, hi float64) []float64 {
	out := make([]float64, len(a))
	for i, v := range a {
		out[i] = Clamp(v, lo, hi)
	}
	return out
}

func shapePacedVelocities(s *model.Streams, p StreamParams) {
	if len(s.VelocitySmooth) == 0 || !model.IsPaced(p.Type) {
		return
	}
	// A paced stream starting at 0 means an infinite first pace; use the first known speed.
	if s.VelocitySmooth[0] == 0 {
		for _, v := range s.VelocitySmooth {
			if v > 0 {
				s.VelocitySmooth[0] = v
				break
			}
		}
	}
	if model.IsByFoot(p.Type) {
		lo := 2 / 3.6
		if model.IsRun(p.Type) {
			lo = 3 / 3.6
		}
		s.VelocitySmooth = clampStream(s.VelocitySmooth, lo, 34/3.6)
		s.VelocitySmooth = KalmanApply(s.VelocitySmooth, 0.01, 1/3.6)
	}
	if model.IsSwim(p.Type) && !p.IsSwimPool {
		s.VelocitySmooth = clampStream(s.VelocitySmooth, 0.3, 8.5/3.6)
	}
}

// RunningGradeAdjustedSpeedFactor is a 5th order fit of Strava's GAP model.
func RunningGradeAdjustedSpeedFactor(g float64) float64 {
	return 1 + 0.029290920646623777*g + 0.0018083953212790634*g*g + 4.0662425671715924e-7*g*g*g +
		-3.686186584867523e-7*g*g*g*g + -2.6628107325930747e-9*g*g*g*g*g
}

func computeGradeAdjustedSpeed(s *model.Streams, p StreamParams) {
	if !model.IsRun(p.Type) || len(s.VelocitySmooth) == 0 || len(s.GradeSmooth) == 0 {
		return
	}
	s.GradeAdjustedSpeed = make([]float64, len(s.VelocitySmooth))
	for i, mps := range s.VelocitySmooth {
		g := 0.0
		if i < len(s.GradeSmooth) {
			g = s.GradeSmooth[i]
		}
		s.GradeAdjustedSpeed[i] = Round(mps*RunningGradeAdjustedSpeedFactor(g), 2)
	}
}

func estimatedPowerStream(s *model.Streams, p StreamParams) []float64 {
	if p.Weight <= 0 {
		return nil
	}
	switch {
	case model.IsRide(p.Type, false):
		if len(s.VelocitySmooth) == 0 || len(s.GradeSmooth) == 0 {
			return nil
		}
		out := make([]float64, len(s.VelocitySmooth))
		for i, v := range s.VelocitySmooth {
			g := 0.0
			if i < len(s.GradeSmooth) {
				g = s.GradeSmooth[i]
			}
			w := CyclingPower(v*3.6, g, p.Weight)
			// Not pedaling means no power, whatever the speed.
			if len(s.Cadence) > i && s.Cadence[i] < 30 {
				w = 0
			}
			out[i] = w
		}
		return out
	case model.IsRun(p.Type):
		if len(s.GradeAdjustedSpeed) == 0 {
			return nil
		}
		return RunningPowerStream(p.Weight, s.GradeAdjustedSpeed)
	}
	return nil
}

// CyclingPower estimates leg power (W) at kph on a grade, after gribble.org's calculator.
func CyclingPower(kph, gradePercent, riderWeightKg float64) float64 {
	const (
		bikeKg, gearKg, waterKg = 8.0, 2.0, 1.0
		frontalArea             = 0.509
		cd                      = 0.63
		driveTrainLoss          = 2.0
		crr                     = 0.005
		rho                     = 1.22601
		headWind                = 0.0
	)
	total := riderWeightKg + bikeKg + gearKg + waterKg
	fGravity := 9.8067 * total * math.Sin(math.Atan(gradePercent/100))
	fRolling := 9.8067 * total * math.Cos(math.Atan(gradePercent/100)) * crr
	if kph < 0 {
		fRolling = -fRolling
	}
	v := (kph + headWind) * 1000 / 3600
	fDrag := 0.5 * frontalArea * cd * rho * v * v
	if kph+headWind < 0 {
		fDrag = -fDrag
	}
	wheel := (fGravity + fRolling + fDrag) * (kph * 1000 / 3600)
	frac := 1.0
	if wheel > 0 {
		frac -= driveTrainLoss / 100
	}
	leg := wheel / frac
	if leg > 0 {
		return math.Round(leg*100) / 100
	}
	return 0
}

// RunningPowerStream estimates running power from grade-adjusted speed (Stryd's 1.04 * kg * m/s).
func RunningPowerStream(weight float64, gradeAdjustedSpeed []float64) []float64 {
	out := make([]float64, len(gradeAdjustedSpeed))
	for i, v := range gradeAdjustedSpeed {
		out[i] = 1.04 * weight * v
	}
	return out
}
