import SwiftUI
import UniformTypeIdentifiers
import Observation

@Observable
final class ChopViewModel {
    let audioEngine = AudioEngine()
    
    var showFilePicker = false
    var showMusicLibrary = false
    var showDeezerSearch = false
    var showImportOptions = false
    var activePadIndex: Int?
    var selectedSliceIndex: Int?
    var showSliceDetail = false
    
    func setup() {
        audioEngine.setup()
    }
    
    // MARK: - File Import
    
    func loadFile(url: URL) {
        Task {
            let accessing = url.startAccessingSecurityScopedResource()
            defer {
                if accessing { url.stopAccessingSecurityScopedResource() }
            }
            await audioEngine.loadAndChop(url: url)
        }
    }
    
    // MARK: - Music Library Import
    
    func loadFromMusicLibrary(url: URL) {
        showMusicLibrary = false
        Task {
            await audioEngine.loadAndChop(url: url)
        }
    }
    
    // MARK: - Deezer Import
    
    func loadFromDeezer(url: URL, name: String) {
        showDeezerSearch = false
        Task {
            await audioEngine.loadAndChop(url: url)
            // Override name since we know the track info
            if audioEngine.choppedTrack != nil {
                // The name from the filename will include artist, which is fine
            }
        }
    }
    
    // MARK: - Pad Interaction
    
    func tapPad(_ sample: Sample) {
        activePadIndex = sample.id
        audioEngine.playSample(sample)
        
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            if activePadIndex == sample.id {
                activePadIndex = nil
            }
        }
    }
    
    // MARK: - Slice Editing
    
    func selectSlice(_ index: Int) {
        if selectedSliceIndex == index {
            // Double tap — show detail
            showSliceDetail = true
        } else {
            selectedSliceIndex = index
        }
    }
    
    func moveBoundary(at index: Int, to newTime: TimeInterval) {
        guard let track = audioEngine.choppedTrack else { return }
        
        // Build current boundaries
        var boundaries: [TimeInterval] = [track.samples[0].startTime]
        for sample in track.samples {
            boundaries.append(sample.endTime)
        }
        
        guard index > 0, index < boundaries.count - 1 else { return }
        
        // Clamp: at least 0.02s from neighbors
        let minGap = 0.02
        let clamped = min(max(newTime, boundaries[index - 1] + minGap), boundaries[index + 1] - minGap)
        boundaries[index] = clamped
        
        audioEngine.reslice(boundaries: boundaries)
    }
    
    func resetSlices() {
        selectedSliceIndex = nil
        showSliceDetail = false
        audioEngine.resetSlices()
    }
    
    var selectedSample: Sample? {
        guard let idx = selectedSliceIndex,
              let track = audioEngine.choppedTrack,
              idx < track.samples.count else { return nil }
        return track.samples[idx]
    }
}
