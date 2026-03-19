import AVFoundation
import Observation

/// Core audio engine — loads files, chops into slices, plays pads
@Observable
final class AudioEngine {
    private let engine = AVAudioEngine()
    private let playerPool: [AVAudioPlayerNode]
    private let maxPolyphony = 8
    private var currentPlayerIndex = 0
    
    /// Full-file PCM buffer for waveform drawing & re-slicing
    private var sourceBuffer: AVAudioPCMBuffer?
    private var sourceFormat: AVAudioFormat?
    
    var choppedTrack: ChoppedTrack?
    var isLoading = false
    var error: String?
    
    /// Waveform amplitude data (down-sampled for drawing)
    var waveformData: [Float] = []
    
    /// Currently playing sample id (for waveform highlight)
    var playingSampleId: Int?
    
    init() {
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
            let sampleRate = format.sampleRate
            let totalDuration = Double(totalFrames) / sampleRate
            
            // Read entire file into source buffer for re-slicing
            guard let fullBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames) else {
                self.error = "Could not allocate audio buffer"
                isLoading = false
                return
            }
            file.framePosition = 0
            try file.read(into: fullBuffer, frameCount: totalFrames)
            self.sourceBuffer = fullBuffer
            self.sourceFormat = format
            
            // Extract waveform
            self.waveformData = Self.extractWaveformSamples(from: fullBuffer, targetCount: 512)
            
            // Chop into equal slices
            let samples = Self.chopBuffer(fullBuffer, format: format, sliceCount: sliceCount, sampleRate: sampleRate)
            
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
    
    // MARK: - Re-slice with custom boundaries
    
    /// Update slice boundaries. `boundaries` is an array of time points including 0 and totalDuration.
    func reslice(boundaries: [TimeInterval]) {
        guard let sourceBuffer, let format = sourceFormat, let track = choppedTrack else { return }
        let sampleRate = track.sampleRate
        
        var newSamples: [Sample] = []
        for i in 0..<(boundaries.count - 1) {
            let startTime = boundaries[i]
            let endTime = boundaries[i + 1]
            let startFrame = AVAudioFramePosition(startTime * sampleRate)
            let endFrame = AVAudioFramePosition(endTime * sampleRate)
            let frameCount = AVAudioFrameCount(endFrame - startFrame)
            
            guard frameCount > 0,
                  let sliceBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { continue }
            
            // Copy frames from source buffer
            let channelCount = Int(format.channelCount)
            for ch in 0..<channelCount {
                guard let src = sourceBuffer.floatChannelData?[ch],
                      let dst = sliceBuffer.floatChannelData?[ch] else { continue }
                let srcOffset = Int(startFrame)
                for f in 0..<Int(frameCount) {
                    if srcOffset + f < Int(sourceBuffer.frameLength) {
                        dst[f] = src[srcOffset + f]
                    }
                }
            }
            sliceBuffer.frameLength = frameCount
            
            newSamples.append(Sample(
                id: i,
                startTime: startTime,
                endTime: endTime,
                buffer: sliceBuffer
            ))
        }
        
        choppedTrack?.samples = newSamples
    }
    
    /// Reset to equal slices
    func resetSlices(count: Int = 16) {
        guard let track = choppedTrack else { return }
        var boundaries: [TimeInterval] = []
        for i in 0...count {
            boundaries.append(track.totalDuration * Double(i) / Double(count))
        }
        reslice(boundaries: boundaries)
    }
    
    // MARK: - Waveform Extraction
    
    /// Down-sample PCM buffer to an array of peak amplitudes for drawing
    static func extractWaveformSamples(from buffer: AVAudioPCMBuffer, targetCount: Int) -> [Float] {
        guard let channelData = buffer.floatChannelData else { return [] }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return [] }
        
        let samplesPerBin = max(1, frameCount / targetCount)
        let binCount = frameCount / samplesPerBin
        
        var result = [Float](repeating: 0, count: binCount)
        let data = channelData[0] // Use first channel
        
        for bin in 0..<binCount {
            var peak: Float = 0
            let start = bin * samplesPerBin
            let end = min(start + samplesPerBin, frameCount)
            for i in start..<end {
                let abs = Swift.abs(data[i])
                if abs > peak { peak = abs }
            }
            result[bin] = peak
        }
        
        return result
    }
    
    // MARK: - Playback
    
    func playSample(_ sample: Sample) {
        let player = playerPool[currentPlayerIndex % maxPolyphony]
        currentPlayerIndex += 1
        
        if player.isPlaying {
            player.stop()
        }
        
        playingSampleId = sample.id
        
        player.scheduleBuffer(sample.buffer, at: nil, options: .interrupts)
        player.play()
        
        // Clear highlight after sample finishes
        let duration = sample.duration
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(duration))
            if playingSampleId == sample.id {
                playingSampleId = nil
            }
        }
    }
    
    func stop() {
        for player in playerPool {
            player.stop()
        }
        playingSampleId = nil
    }
    
    // MARK: - Private helpers
    
    private static func chopBuffer(_ buffer: AVAudioPCMBuffer, format: AVAudioFormat, sliceCount: Int, sampleRate: Double) -> [Sample] {
        let totalFrames = buffer.frameLength
        let framesPerSlice = totalFrames / AVAudioFrameCount(sliceCount)
        let channelCount = Int(format.channelCount)
        
        var samples: [Sample] = []
        
        for i in 0..<sliceCount {
            let startFrame = AVAudioFramePosition(i) * AVAudioFramePosition(framesPerSlice)
            let frameCount: AVAudioFrameCount
            if i == sliceCount - 1 {
                frameCount = totalFrames - AVAudioFrameCount(startFrame)
            } else {
                frameCount = framesPerSlice
            }
            
            guard let sliceBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { continue }
            
            for ch in 0..<channelCount {
                guard let src = buffer.floatChannelData?[ch],
                      let dst = sliceBuffer.floatChannelData?[ch] else { continue }
                for f in 0..<Int(frameCount) {
                    dst[f] = src[Int(startFrame) + f]
                }
            }
            sliceBuffer.frameLength = frameCount
            
            let startTime = Double(startFrame) / sampleRate
            let endTime = Double(startFrame + AVAudioFramePosition(frameCount)) / sampleRate
            
            samples.append(Sample(
                id: i,
                startTime: startTime,
                endTime: endTime,
                buffer: sliceBuffer
            ))
        }
        
        return samples
    }
}
