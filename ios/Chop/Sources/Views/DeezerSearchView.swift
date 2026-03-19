import SwiftUI

/// Search Deezer for songs, tap to download 30s preview and chop
struct DeezerSearchView: View {
    let onSelect: (URL, String) -> Void
    let onCancel: () -> Void
    
    @State private var query = ""
    @State private var results: [DeezerTrack] = []
    @State private var isSearching = false
    @State private var isDownloading: Int? = nil // track id being downloaded
    @State private var error: String?
    
    private let deezer = DeezerService()
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Search field
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.gray)
                        
                        TextField("Search any song...", text: $query)
                            .textFieldStyle(.plain)
                            .foregroundStyle(.white)
                            .autocorrectionDisabled()
                            .onSubmit { performSearch() }
                        
                        if !query.isEmpty {
                            Button {
                                query = ""
                                results = []
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.gray)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    
                    if isSearching {
                        Spacer()
                        ProgressView()
                            .tint(.orange)
                        Spacer()
                    } else if results.isEmpty && !query.isEmpty {
                        Spacer()
                        Text("No results")
                            .foregroundStyle(.gray)
                        Spacer()
                    } else if results.isEmpty {
                        Spacer()
                        VStack(spacing: 12) {
                            Image(systemName: "music.magnifyingglass")
                                .font(.system(size: 40))
                                .foregroundStyle(.gray)
                            Text("Search for any song\nto chop a 30s preview")
                                .font(.subheadline)
                                .foregroundStyle(.gray)
                                .multilineTextAlignment(.center)
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 0) {
                                ForEach(results) { track in
                                    TrackRow(
                                        track: track,
                                        isDownloading: isDownloading == track.id
                                    ) {
                                        downloadAndChop(track)
                                    }
                                }
                            }
                            .padding(.top, 8)
                        }
                    }
                    
                    if let error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                    }
                }
            }
            .navigationTitle("Search Songs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                        .foregroundStyle(.orange)
                }
            }
        }
    }
    
    private func performSearch() {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSearching = true
        error = nil
        
        Task {
            do {
                results = try await deezer.search(query: query)
            } catch {
                self.error = "Search failed: \(error.localizedDescription)"
            }
            isSearching = false
        }
    }
    
    private func downloadAndChop(_ track: DeezerTrack) {
        guard isDownloading == nil else { return }
        isDownloading = track.id
        error = nil
        
        Task {
            do {
                let url = try await deezer.downloadPreview(track: track)
                let name = "\(track.title) - \(track.artist.name)"
                isDownloading = nil
                onSelect(url, name)
            } catch {
                self.error = "Download failed: \(error.localizedDescription)"
                isDownloading = nil
            }
        }
    }
}

// MARK: - Track Row

struct TrackRow: View {
    let track: DeezerTrack
    let isDownloading: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Album art
                AsyncImage(url: track.album.coverURL) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.1))
                        .overlay(
                            Image(systemName: "music.note")
                                .foregroundStyle(.gray)
                        )
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                
                // Track info
                VStack(alignment: .leading, spacing: 3) {
                    Text(track.title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    
                    Text(track.artist.name)
                        .font(.caption)
                        .foregroundStyle(.gray)
                        .lineLimit(1)
                }
                
                Spacer()
                
                if isDownloading {
                    ProgressView()
                        .tint(.orange)
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "arrow.down.circle")
                        .font(.title3)
                        .foregroundStyle(.orange)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
