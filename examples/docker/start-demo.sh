#!/usr/bin/env bash
set -euo pipefail
set +u
source "/opt/ros/$ROS_DISTRO/setup.bash"
set -u
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
if [ "$ROS_VERSION" = "2" ]; then
  ros2 launch rosbridge_server rosbridge_websocket_launch.xml address:=0.0.0.0 port:=9090 &
else
  roslaunch rosbridge_server rosbridge_websocket.launch address:=0.0.0.0 port:=18502 &
fi
pids+=("$!")
python3 -u /opt/rviz-demo/publisher.py "$ROS_VERSION" &
pids+=("$!")
echo "Synthetic ROS $ROS_VERSION publishers starting; wait for the rosbridge server ready log."
wait -n "${pids[@]}"
