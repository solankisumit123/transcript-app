"""
Curated demo transcripts.
Used as a fallback when the deployed environment IP is blocked by YouTube
(common on cloud providers). Production deployments should use residential
proxies or the YouTube Data API v3 caption track endpoint.
"""
from typing import Dict, List

# Each entry: list of (start_seconds, duration_seconds, text)
DEMO_TRANSCRIPTS: Dict[str, Dict] = {
    # Rick Astley — Never Gonna Give You Up (213s) — public, widely known lyrics
    "dQw4w9WgXcQ": {
        "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        "language": "en",
        "duration": 213.0,
        "segments": [
            (0.0, 18.0, "[Music intro]"),
            (18.0, 4.0, "We're no strangers to love"),
            (22.0, 4.5, "You know the rules and so do I"),
            (26.5, 5.0, "A full commitment's what I'm thinking of"),
            (31.5, 5.0, "You wouldn't get this from any other guy"),
            (36.5, 4.5, "I just wanna tell you how I'm feeling"),
            (41.0, 4.0, "Gotta make you understand"),
            (45.0, 4.0, "Never gonna give you up"),
            (49.0, 4.0, "Never gonna let you down"),
            (53.0, 4.5, "Never gonna run around and desert you"),
            (57.5, 4.0, "Never gonna make you cry"),
            (61.5, 4.0, "Never gonna say goodbye"),
            (65.5, 4.5, "Never gonna tell a lie and hurt you"),
            (70.0, 6.0, "We've known each other for so long"),
            (76.0, 5.0, "Your heart's been aching but you're too shy to say it"),
            (81.0, 5.0, "Inside we both know what's been going on"),
            (86.0, 5.0, "We know the game and we're gonna play it"),
            (91.0, 5.0, "And if you ask me how I'm feeling"),
            (96.0, 4.0, "Don't tell me you're too blind to see"),
            (100.0, 4.0, "Never gonna give you up"),
            (104.0, 4.0, "Never gonna let you down"),
            (108.0, 4.5, "Never gonna run around and desert you"),
            (112.5, 4.0, "Never gonna make you cry"),
            (116.5, 4.0, "Never gonna say goodbye"),
            (120.5, 4.5, "Never gonna tell a lie and hurt you"),
            (125.0, 5.0, "Never gonna give, never gonna give"),
            (130.0, 5.0, "(Give you up)"),
            (135.0, 8.0, "[Instrumental break]"),
            (143.0, 6.0, "We've known each other for so long"),
            (149.0, 5.0, "Your heart's been aching but you're too shy to say it"),
            (154.0, 5.0, "Inside we both know what's been going on"),
            (159.0, 5.0, "We know the game and we're gonna play it"),
            (164.0, 5.0, "I just wanna tell you how I'm feeling"),
            (169.0, 4.0, "Gotta make you understand"),
            (173.0, 4.0, "Never gonna give you up"),
            (177.0, 4.0, "Never gonna let you down"),
            (181.0, 4.5, "Never gonna run around and desert you"),
            (185.5, 4.0, "Never gonna make you cry"),
            (189.5, 4.0, "Never gonna say goodbye"),
            (193.5, 4.5, "Never gonna tell a lie and hurt you"),
            (198.0, 15.0, "[Outro]"),
        ],
    },
    # Me at the zoo — first YouTube video, very short, public domain narration
    "jNQXAC9IVRw": {
        "title": "Me at the zoo",
        "language": "en",
        "duration": 19.0,
        "segments": [
            (0.0, 3.0, "Alright, so here we are in front of the elephants."),
            (3.0, 5.0, "And the cool thing about these guys is that they have really, really, really long trunks."),
            (8.0, 4.0, "And that's, that's cool."),
            (12.0, 4.0, "And that's pretty much all there is to say."),
        ],
    },
    # PSY — Gangnam Style — short curated lyric snippet
    "9bZkp7q19f0": {
        "title": "PSY - GANGNAM STYLE (강남스타일) M/V",
        "language": "en",
        "duration": 252.0,
        "segments": [
            (0.0, 6.0, "Oppan Gangnam Style"),
            (6.0, 6.0, "Gangnam Style"),
            (12.0, 8.0, "A girl who is warm and humanly during the day"),
            (20.0, 8.0, "A classy girl who knows how to enjoy the freedom of a cup of coffee"),
            (28.0, 8.0, "A girl whose heart gets hotter when night comes"),
            (36.0, 6.0, "A girl with that kind of twist"),
            (42.0, 6.0, "I'm a guy"),
            (48.0, 8.0, "A guy who is as warm as you during the day"),
            (56.0, 8.0, "A guy who one-shots his coffee before it even cools down"),
            (64.0, 8.0, "A guy whose heart bursts when night comes"),
            (72.0, 6.0, "That kind of guy"),
            (78.0, 8.0, "Beautiful, loveable"),
            (86.0, 8.0, "Yes, you, hey, yes you, hey"),
            (94.0, 8.0, "Beautiful, loveable"),
            (102.0, 8.0, "Yes, you, hey, yes you, hey"),
            (110.0, 8.0, "Now let's go until the end"),
            (118.0, 8.0, "Oppan Gangnam Style, Gangnam Style"),
            (126.0, 12.0, "Op-op-op-op, Oppan Gangnam Style"),
            (138.0, 12.0, "Eh- sexy lady, op-op-op-op"),
            (150.0, 12.0, "Oppan Gangnam Style, eh- sexy lady"),
            (162.0, 90.0, "[Music continues with chorus repetition through end of track]"),
        ],
    },
}


def get_demo_transcript(video_id: str):
    return DEMO_TRANSCRIPTS.get(video_id)


def list_demo_ids() -> List[str]:
    return list(DEMO_TRANSCRIPTS.keys())
