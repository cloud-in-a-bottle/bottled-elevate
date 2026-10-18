package model

const (
	Ride        = "Ride"
	VirtualRide = "VirtualRide"
	EBikeRide   = "EBikeRide"
	Run         = "Run"
	VirtualRun  = "VirtualRun"
	Walk        = "Walk"
	Hike        = "Hike"
	Swim        = "Swim"
	Other       = "Other"
)

func IsRide(sport string, allowElectric bool) bool {
	return sport == Ride || sport == VirtualRide || (allowElectric && sport == EBikeRide)
}

func IsRun(sport string) bool      { return sport == Run || sport == VirtualRun }
func IsWalkHike(sport string) bool { return sport == Hike || sport == Walk }
func IsByFoot(sport string) bool   { return IsRun(sport) || IsWalkHike(sport) }
func IsSwim(sport string) bool     { return sport == Swim }
func IsPaced(sport string) bool    { return IsByFoot(sport) || IsSwim(sport) }

// Sports is every sport the app knows (Elevate's ElevateSport enum).
var Sports = []string{
	"AlpineSki", "AmericanFootball", "Aquathlon", "BackcountrySki", "Badminton", "Baseball", "Basketball", "Boxing",
	"Canoeing", "Cardio", "Climbing", "Combat", "Cricket", "Crossfit", "Dance", "Diving", "Drive", "Duathlon",
	"EBikeRide", "Elliptical", "ESkateboard", "EUnicycle", "Fishing", "Flying", "Football", "Frisbee", "Golf",
	"Gymnastics", "Handcycle", "Handball", "HangGliding", "Hike", "HorsebackRiding", "IceHockey", "IceSkate",
	"InlineSkate", "Kayaking", "Kitesurf", "Manual", "MotorSports", "Mountaineering", "NordicSki", "Orienteering",
	"Other", "Paragliding", "Pickleball", "Ride", "RockClimbing", "RollerSki", "Rowing", "Rugby", "Run", "Sailing",
	"Skateboard", "SkiTouring", "SkyDiving", "Snorkeling", "Snowboard", "Snowmobiling", "Snowshoe", "Softball",
	"Squash", "StairStepper", "StandUpPaddling", "Stretching", "Surfing", "Swim", "TableTennis", "Tactical",
	"TelemarkSki", "Tennis", "TrackAndField", "Triathlon", "Velomobile", "VirtualRide", "VirtualRun", "Volleyball",
	"Wakeboarding", "Walk", "WaterSkiing", "WeightTraining", "Wheelchair", "Windsurf", "Workout", "Yoga",
}

var sportSet = func() map[string]bool {
	m := map[string]bool{}
	for _, s := range Sports {
		m[s] = true
	}
	return m
}()

func IsSport(s string) bool { return sportSet[s] }
