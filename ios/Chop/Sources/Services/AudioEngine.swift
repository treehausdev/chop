import AVFoundation
import Observation

/// Core audio engine — loads files, chops into slices, plays pads
@Observable
final class AudioEngine {
    private let engine = AVAudioEngine()
    private let playerPool: [AVAudioPlayerNode]
    private let maxPolyphony = 8
    private var currentPlayerIndex = 0
    
    var choppedTrack: ChoppedTrack?
    var isLoading = false
    var error: String?
    
    init() {
        // Pre-create player nodes for polyphony
        var players: [AVAudioPlayerNode] = []
        for _ in 0..<maxPolyphony {
            let player = AVAudioPlayerNode()
            players.append(player)
        }
        self.playerPool = players
    }
    
    // MARK: - Setup
    
    func setup() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
        
        for player in playerPool {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: nil)
        }
        
        try? engine.start()
    }
    
    // MARK: - Load & Chop
    
    func loadAndChop(url: URL, sliceCount: Int = 16) async {
        isLoading = true
        error = nil
        
        do {
            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let totalFrames = AVAudioFrameCount(file.length)
            let framesPerSlice = totalFrames / AVAudioFrameCount(sliceCount)
            let sampleRate = format.sampleRate
            let totalDuration = Double(totalFrames) / sampleRate
            
            var samples: [Sample] = []
            
            for i in 0..<sliceCount {
                let startFrame = AVAudioFramePosition(i) * AVAudioFramePosition(framesPerSlice)
                let frameCount = min(framesPerSlice, totalFrames - AVAudioFrameCount(startFrame))
                
                guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { continue }
                
                file.framePosition = startFrame
                try file.read(into: buffer, frameCount: frameCount)
                
                let startTime = Double(startFrame) / sampleRate
                let endTime = Double(startFrame + AVAudioFramePosition(frameCount)) / sampleRate
                
                samples.append(Sample(
                    id: i,
                    startTime: startTime,
                    endTime: endTime,
                    buffer: buffer
                ))
            }
            
            let name = url.deletingPathExtension().lastPathComponent
            choppedTrack = ChoppedTrack(
                name: name,
                originalURL: url,
                samples: samples,
                sampleRate: sampleRate,
                totalDuration: totalDuration
            )
            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }
    
    // MARK: - Playback
    
    func playSample(_ sample: Sample) {
        let player = playerPool[currentPlayerIndex % maxPolyphony]
        currentPlayerIndex += 1
        
        if player.isPlaying {
            player.stop()
        }
        
        player.scheduleBuffer(sample.buffer, at: nil, options: .interrupts)
        player.play()
    }
    
    func stop() {
        for player in playerPool {
            player.stop()
        }
    }
}
