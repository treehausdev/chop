import Foundation
import AVFoundation

/// A single audio slice from a chopped track
struct Sample: Identifiable {
    let id: Int
    var startTime: TimeInterval
    var endTime: TimeInterval
    var buffer: AVAudioPCMBuffer
    
    var duration: TimeInterval {
        endTime - startTime
    }
}

/// A loaded and chopped track
struct ChoppedTrack: Identifiable {
    let id = UUID()
    let name: String
    let originalURL: URL
    var samples: [Sample]
    let sampleRate: Double
    let totalDuration: TimeInterval
}
