"""Synthetic publishers for isolated ROS 1 / ROS 2 integration acceptance."""
import math
import sys
from sensor_msgs.msg import LaserScan, PointCloud2, PointField
from nav_msgs.msg import OccupancyGrid, Path
from geometry_msgs.msg import PoseStamped
from visualization_msgs.msg import Marker, MarkerArray
import struct
from geometry_msgs.msg import TransformStamped
from tf2_msgs.msg import TFMessage

ros = int(sys.argv[1])
if ros == 2:
    import rclpy
    from rclpy.node import Node
    rclpy.init()
    node = Node('aide_rviz_acceptance')
    scan_pub = node.create_publisher(LaserScan, '/rviz_acceptance/scan', 10)
    tf_pub = node.create_publisher(TFMessage, '/tf', 10)
    cloud_pub = node.create_publisher(PointCloud2, '/rviz_acceptance/cloud', 10)
    map_pub = node.create_publisher(OccupancyGrid, '/rviz_acceptance/map', 10)
    path_pub = node.create_publisher(Path, '/rviz_acceptance/path', 10)
    marker_pub = node.create_publisher(MarkerArray, '/rviz_acceptance/markers', 10)
    now = lambda: node.get_clock().now().to_msg()
else:
    import rospy
    rospy.init_node('aide_rviz_acceptance')
    scan_pub = rospy.Publisher('/rviz_acceptance/scan', LaserScan, queue_size=1)
    tf_pub = rospy.Publisher('/tf', TFMessage, queue_size=1)
    cloud_pub = rospy.Publisher('/rviz_acceptance/cloud', PointCloud2, queue_size=1)
    map_pub = rospy.Publisher('/rviz_acceptance/map', OccupancyGrid, queue_size=1)
    path_pub = rospy.Publisher('/rviz_acceptance/path', Path, queue_size=1)
    marker_pub = rospy.Publisher('/rviz_acceptance/markers', MarkerArray, queue_size=1)
    now = rospy.Time.now

def publish():
    scan = LaserScan()
    scan.header.frame_id = 'acceptance_laser'
    scan.header.stamp = now()
    scan.angle_min = -math.pi
    scan.angle_max = math.pi
    scan.angle_increment = math.pi / 180
    scan.range_min = 0.1
    scan.range_max = 10.0
    scan.ranges = [3.0 + 0.2 * math.sin(i / 10) for i in range(360)]
    tr = TransformStamped()
    tr.header.frame_id = 'map'
    tr.header.stamp = scan.header.stamp
    tr.child_frame_id = 'acceptance_laser'
    tr.transform.translation.x = 1.25
    tr.transform.translation.z = 0.4
    tr.transform.rotation.w = 1.0
    msg = TFMessage()
    body = TransformStamped()
    body.header.frame_id = 'map'
    body.header.stamp = scan.header.stamp
    body.child_frame_id = 'base_link'
    body.transform.rotation.w = 1.0
    msg.transforms = [tr, body]
    tf_pub.publish(msg)
    scan_pub.publish(scan)
    cloud = PointCloud2()
    cloud.header.frame_id = 'map'
    cloud.header.stamp = scan.header.stamp
    cloud.height, cloud.width = 1, 800
    cloud.point_step, cloud.row_step = 12, 800 * 12
    cloud.is_dense = True
    cloud.fields = []
    for index, name in enumerate(['x', 'y', 'z']):
        field = PointField()
        field.name, field.offset, field.datatype, field.count = name, index * 4, 7, 1
        cloud.fields.append(field)
    cloud.data = b''.join(struct.pack('<fff', 2.0 * math.cos(i * 0.11), 2.0 * math.sin(i * 0.11), (i % 25) / 25.0) for i in range(800))
    cloud_pub.publish(cloud)
    grid = OccupancyGrid()
    grid.header = cloud.header
    grid.info.resolution = 0.2
    grid.info.width, grid.info.height = 30, 30
    grid.info.origin.position.x = -3.0
    grid.info.origin.position.y = -3.0
    grid.info.origin.position.z = -0.03
    grid.info.origin.orientation.w = 1.0
    grid.data = [100 if i < 30 or i >= 870 or i % 30 in (0, 29) else 0 for i in range(900)]
    map_pub.publish(grid)
    path = Path()
    path.header = cloud.header
    for i in range(40):
        pose = PoseStamped()
        pose.header = cloud.header
        pose.pose.position.x = i / 10.0 - 2.0
        pose.pose.position.y = math.sin(i / 8.0)
        pose.pose.position.z = 0.03
        pose.pose.orientation.w = 1.0
        path.poses.append(pose)
    path_pub.publish(path)
    marker = Marker()
    marker.header = cloud.header
    marker.ns, marker.id, marker.type, marker.action = 'demo', 1, 2, 0
    marker.pose.position.x, marker.pose.position.y, marker.pose.position.z = -1.0, 1.0, 0.3
    marker.pose.orientation.w = 1.0
    marker.scale.x = marker.scale.y = marker.scale.z = 0.3
    marker.color.r, marker.color.g, marker.color.b, marker.color.a = 0.9, 0.6, 0.2, 1.0
    markers = MarkerArray()
    markers.markers = [marker]
    marker_pub.publish(markers)

if ros == 2:
    node.create_timer(0.1, publish)
    rclpy.spin(node)
else:
    rate = rospy.Rate(10)
    while not rospy.is_shutdown():
        publish()
        rate.sleep()
